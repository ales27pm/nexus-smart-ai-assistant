import Foundation
import CoreML
import CryptoKit

// MARK: - Public Types

public enum CoreMLModelPreset: String, CaseIterable, Codable, Sendable {
    case fp16 = "FP16"
    case int8 = "INT8"
    case int4lut = "INT4-LUT"
}

public enum CoreMLModelLoaderState: Equatable, Sendable {
    case idle
    case checkingCache
    case preparingDownload
    case downloading(progress: Double, receivedBytes: Int64, expectedBytes: Int64?)
    case retrying(attempt: Int, maxAttempts: Int, delaySeconds: Double, reason: String)
    case verifying
    case extracting
    case compiling(progress: Double)
    case loading
    case ready
    case failed(message: String)

    public var userFacingTitle: String {
        switch self {
        case .idle: return "Idle"
        case .checkingCache: return "Checking cache"
        case .preparingDownload: return "Preparing download"
        case .downloading: return "Downloading model"
        case .retrying: return "Retrying download"
        case .verifying: return "Verifying model"
        case .extracting: return "Preparing package"
        case .compiling: return "Compiling CoreML"
        case .loading: return "Loading model"
        case .ready: return "Ready"
        case .failed: return "Failed"
        }
    }

    public var progressValue: Double {
        switch self {
        case .idle: return 0.0
        case .checkingCache: return 0.03
        case .preparingDownload: return 0.05
        case let .downloading(progress, _, _):
            return min(max(0.05 + (progress * 0.75), 0.05), 0.80)
        case .retrying: return 0.08
        case .verifying: return 0.86
        case .extracting: return 0.90
        case let .compiling(progress):
            return min(max(0.90 + (progress * 0.08), 0.90), 0.98)
        case .loading: return 0.99
        case .ready: return 1.0
        case .failed: return 0.0
        }
    }
}

public struct CoreMLModelSource: Codable, Hashable, Sendable {
    public let url: URL
    public let label: String

    public init(url: URL, label: String) {
        self.url = url
        self.label = label
    }
}

public struct CoreMLModelDescriptor: Codable, Sendable {
    public let id: String
    public let displayName: String
    public let preset: CoreMLModelPreset
    public let remoteSources: [CoreMLModelSource]
    public let sha256: String?
    public let bundledResourceName: String?
    public let bundledResourceExtension: String?
    public let fileName: String
    public let compiledFolderName: String

    public init(
        id: String,
        displayName: String,
        preset: CoreMLModelPreset,
        remoteSources: [CoreMLModelSource],
        sha256: String?,
        bundledResourceName: String?,
        bundledResourceExtension: String?,
        fileName: String,
        compiledFolderName: String
    ) {
        self.id = id
        self.displayName = displayName
        self.preset = preset
        self.remoteSources = remoteSources
        self.sha256 = sha256?.lowercased()
        self.bundledResourceName = bundledResourceName
        self.bundledResourceExtension = bundledResourceExtension
        self.fileName = fileName
        self.compiledFolderName = compiledFolderName
    }
}

public struct CoreMLModelLoadResult: Sendable {
    public let model: MLModel
    public let compiledModelURL: URL
    public let originalPackageURL: URL?
}

public struct CoreMLLoaderLogEntry: Identifiable, Codable, Equatable, Sendable {
    public let id: UUID
    public let timestamp: Date
    public let level: String
    public let message: String

    public init(timestamp: Date = Date(), level: String, message: String) {
        self.id = UUID()
        self.timestamp = timestamp
        self.level = level
        self.message = message
    }
}

// MARK: - Observable Bridge

#if canImport(Combine)
import Combine

@MainActor
public final class CoreMLModelLoaderStore: ObservableObject {
    @Published public private(set) var state: CoreMLModelLoaderState = .idle
    @Published public private(set) var logs: [CoreMLLoaderLogEntry] = []
    @Published public private(set) var lastErrorMessage: String?

    private let loader: CoreMLModelLoader

    public init(loader: CoreMLModelLoader) {
        self.loader = loader
        self.loader.onStateChange = { [weak self] state in
            Task { @MainActor in
                self?.state = state
                if case let .failed(message) = state {
                    self?.lastErrorMessage = message
                }
            }
        }
        self.loader.onLog = { [weak self] entry in
            Task { @MainActor in
                self?.logs.append(entry)
                if self?.logs.count ?? 0 > 600 {
                    self?.logs.removeFirst((self?.logs.count ?? 0) - 600)
                }
            }
        }
    }

    public func loadModel(_ descriptor: CoreMLModelDescriptor, configuration: MLModelConfiguration = MLModelConfiguration()) async -> CoreMLModelLoadResult? {
        do {
            return try await loader.loadModel(descriptor, configuration: configuration)
        } catch {
            self.lastErrorMessage = error.localizedDescription
            return nil
        }
    }

    public func cancel() {
        loader.cancel()
    }

    public func clearLogs() {
        logs.removeAll()
    }
}
#endif

// MARK: - Errors

public enum CoreMLModelLoaderError: LocalizedError, Sendable {
    case cancelled
    case invalidResponse
    case missingExpectedFile(URL)
    case checksumMismatch(expected: String, actual: String)
    case noSourcesAvailable
    case allSourcesFailed(messages: [String])
    case bundleResourceMissing(name: String, ext: String?)
    case modelCompilationFailed(String)
    case modelLoadFailed(String)
    case filesystemFailure(String)
    case stalledDownload
    case unknown(String)

    public var errorDescription: String? {
        switch self {
        case .cancelled:
            return "Operation cancelled."
        case .invalidResponse:
            return "Invalid server response."
        case let .missingExpectedFile(url):
            return "Expected file missing at \(url.path)."
        case let .checksumMismatch(expected, actual):
            return "Checksum mismatch. Expected \(expected), got \(actual)."
        case .noSourcesAvailable:
            return "No model sources available."
        case let .allSourcesFailed(messages):
            return "All sources failed: " + messages.joined(separator: " | ")
        case let .bundleResourceMissing(name, ext):
            return "Bundled resource missing: \(name)\(ext.map { ".\($0)" } ?? "")"
        case let .modelCompilationFailed(message):
            return "CoreML compilation failed: \(message)"
        case let .modelLoadFailed(message):
            return "CoreML load failed: \(message)"
        case let .filesystemFailure(message):
            return "Filesystem failure: \(message)"
        case .stalledDownload:
            return "Download stalled without progress."
        case let .unknown(message):
            return message
        }
    }
}

// MARK: - Loader

public final class CoreMLModelLoader: NSObject {
    public typealias StateHandler = @Sendable (CoreMLModelLoaderState) -> Void
    public typealias LogHandler = @Sendable (CoreMLLoaderLogEntry) -> Void

    public var onStateChange: StateHandler?
    public var onLog: LogHandler?

    private let fileManager: FileManager
    private let sessionQueue = OperationQueue()
    private lazy var urlSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.waitsForConnectivity = true
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 60 * 60
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.allowsConstrainedNetworkAccess = true
        config.allowsExpensiveNetworkAccess = true
        config.httpMaximumConnectionsPerHost = 2
        sessionQueue.maxConcurrentOperationCount = 1
        return URLSession(configuration: config, delegate: self, delegateQueue: sessionQueue)
    }()

    private let lock = NSLock()

    private var activeDownloadContext: ActiveDownloadContext?
    private var activeLoadDescriptor: CoreMLModelDescriptor?
    private var isCancelled = false
    private var isLoadInProgress = false
    private var stallTimer: DispatchSourceTimer?

    private let maximumRetriesPerSource = 2
    private let stallTimeoutSeconds: TimeInterval = 25

    public override init() {
        self.fileManager = .default
        super.init()
    }

    public init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        super.init()
    }

    deinit {
        stallTimer?.cancel()
    }

    // MARK: Public API

    public func cancel() {
        lock.lock()
        isCancelled = true
        let context = activeDownloadContext
        let descriptor = activeLoadDescriptor
        context?.downloadTask?.cancel(byProducingResumeData: { [weak self] data in
            guard let self else { return }
            if let data {
                try? data.write(to: self.resumeDataURL(for: descriptor))
                self.log("WARN", "Saved resume data during cancel.")
            }
        })

        if context == nil, let descriptor {
            try? Data().write(to: resumeDataURL(for: descriptor), options: .atomic)
            log("WARN", "Saved cancel marker during non-download phase.")
        }
        lock.unlock()
        transition(.failed(message: CoreMLModelLoaderError.cancelled.localizedDescription))
    }

    public func loadModel(
        _ descriptor: CoreMLModelDescriptor,
        configuration: MLModelConfiguration = MLModelConfiguration()
    ) async throws -> CoreMLModelLoadResult {
        try beginLoadOperation(for: descriptor)
        defer { endLoadOperation() }

        try prepareDirectories(for: descriptor)
        try throwIfCancelled(for: descriptor)

        transition(.checkingCache)
        log("INFO", "Begin loading model: \(descriptor.displayName) (\(descriptor.preset.rawValue))")

        if let cachedResult = try await loadFromCompiledCacheIfValid(descriptor, configuration: configuration) {
            try throwIfCancelled(for: descriptor)
            transition(.ready)
            log("INFO", "Loaded compiled model from cache.")
            return cachedResult
        }

        if let bundledPackageURL = resolveBundledPackageURL(descriptor) {
            log("INFO", "Bundled package found at \(bundledPackageURL.path)")
            let verified = try await verifyPackageIfNeeded(packageURL: bundledPackageURL, descriptor: descriptor, allowMissingChecksum: true)
            let result = try await compileAndLoad(packageURL: verified, descriptor: descriptor, configuration: configuration)
            try throwIfCancelled(for: descriptor)
            transition(.ready)
            return result
        }

        let cachedURL = cachedPackageURL(for: descriptor)
        if fileManager.fileExists(atPath: cachedURL.path) {
            log("INFO", "Found cached package at \(cachedURL.path)")
            let verified = try await verifyPackageIfNeeded(packageURL: cachedURL, descriptor: descriptor, allowMissingChecksum: false)
            let result = try await compileAndLoad(packageURL: verified, descriptor: descriptor, configuration: configuration)
            try throwIfCancelled(for: descriptor)
            transition(.ready)
            return result
        }

        guard !descriptor.remoteSources.isEmpty else {
            throw emitError(.noSourcesAvailable)
        }

        transition(.preparingDownload)

        let packageURL = try await downloadWithFallbacks(descriptor: descriptor)
        let verifiedURL = try await verifyPackageIfNeeded(packageURL: packageURL, descriptor: descriptor, allowMissingChecksum: false)
        let result = try await compileAndLoad(packageURL: verifiedURL, descriptor: descriptor, configuration: configuration)

        try throwIfCancelled(for: descriptor)
        transition(.ready)
        return result
    }

    // MARK: Core Flow

    private func loadFromCompiledCacheIfValid(
        _ descriptor: CoreMLModelDescriptor,
        configuration: MLModelConfiguration
    ) async throws -> CoreMLModelLoadResult? {
        let compiledURL = compiledModelURL(for: descriptor)
        let manifestURL = manifestURL(for: descriptor)

        guard fileManager.fileExists(atPath: compiledURL.path),
              fileManager.fileExists(atPath: manifestURL.path) else {
            log("DEBUG", "Compiled cache miss.")
            return nil
        }

        do {
            let data = try Data(contentsOf: manifestURL)
            let manifest = try JSONDecoder().decode(ModelManifest.self, from: data)

            if let expected = descriptor.sha256,
               let existing = manifest.originalSHA256,
               expected.lowercased() != existing.lowercased() {
                log("WARN", "Compiled cache checksum mismatch versus descriptor. Purging cache.")
                try purgeCompiledCache(descriptor)
                return nil
            }

            try throwIfCancelled(for: descriptor)
            transition(.loading)
            let model = try MLModel(contentsOf: compiledURL, configuration: configuration)
            return CoreMLModelLoadResult(model: model, compiledModelURL: compiledURL, originalPackageURL: nil)
        } catch {
            log("WARN", "Compiled cache failed to load, purging: \(error.localizedDescription)")
            try? purgeCompiledCache(descriptor)
            return nil
        }
    }

    private func resolveBundledPackageURL(_ descriptor: CoreMLModelDescriptor) -> URL? {
        guard let name = descriptor.bundledResourceName else { return nil }
        let ext = descriptor.bundledResourceExtension
        guard let url = Bundle.main.url(forResource: name, withExtension: ext) else {
            log("WARN", "Bundled CoreML model resource missing: \(name).\(ext ?? "") – falling back to cached/remote sources")
            return nil
        }
        return url
    }

    private func verifyPackageIfNeeded(
        packageURL: URL,
        descriptor: CoreMLModelDescriptor,
        allowMissingChecksum: Bool
    ) async throws -> URL {
        try throwIfCancelled(for: descriptor)
        transition(.verifying)
        log("INFO", "Verifying package integrity.")

        guard let expected = descriptor.sha256, !expected.isEmpty else {
            if allowMissingChecksum {
                log("DEBUG", "No checksum provided for bundled/local source. Skipping SHA-256 verification.")
                return packageURL
            }
            throw emitError(.unknown("Descriptor '\(descriptor.id)' is missing SHA-256 for non-bundled model source."))
        }

        let actual = try sha256File(at: packageURL)
        guard actual.lowercased() == expected.lowercased() else {
            if packageURL == cachedPackageURL(for: descriptor) {
                try? fileManager.removeItem(at: packageURL)
                log("WARN", "Removed corrupted cached package.")
            }
            throw emitError(.checksumMismatch(expected: expected, actual: actual))
        }

        log("INFO", "Checksum OK.")
        return packageURL
    }

    private func compileAndLoad(
        packageURL: URL,
        descriptor: CoreMLModelDescriptor,
        configuration: MLModelConfiguration
    ) async throws -> CoreMLModelLoadResult {
        try throwIfCancelled(for: descriptor)
        transition(.extracting)
        log("INFO", "Preparing model package for compilation.")

        let compiledURL = compiledModelURL(for: descriptor)
        let manifestURL = manifestURL(for: descriptor)

        if fileManager.fileExists(atPath: compiledURL.path) {
            try? fileManager.removeItem(at: compiledURL)
        }

        try throwIfCancelled(for: descriptor)
        transition(.compiling(progress: 0.05))
        log("INFO", "Compiling CoreML model. This can take a while on device.")

        let tempCompiledURL: URL = try await Task.detached(priority: .userInitiated) {
            do {
                return try MLModel.compileModel(at: packageURL)
            } catch {
                throw CoreMLModelLoaderError.modelCompilationFailed(error.localizedDescription)
            }
        }.value

        try throwIfCancelled(for: descriptor)
        transition(.compiling(progress: 0.70))

        do {
            try ensureDirectory(compiledURL.deletingLastPathComponent())
            if fileManager.fileExists(atPath: compiledURL.path) {
                try fileManager.removeItem(at: compiledURL)
            }
            try fileManager.copyItem(at: tempCompiledURL, to: compiledURL)
        } catch {
            throw emitError(.filesystemFailure("Could not copy compiled model into cache: \(error.localizedDescription)"))
        }

        try throwIfCancelled(for: descriptor)
        transition(.compiling(progress: 0.95))

        let manifest = ModelManifest(
            id: descriptor.id,
            displayName: descriptor.displayName,
            preset: descriptor.preset.rawValue,
            originalFileName: descriptor.fileName,
            originalSHA256: descriptor.sha256,
            compiledAt: Date()
        )

        do {
            let manifestData = try JSONEncoder().encode(manifest)
            try manifestData.write(to: manifestURL, options: .atomic)
        } catch {
            log("WARN", "Could not write model manifest: \(error.localizedDescription)")
        }

        try throwIfCancelled(for: descriptor)
        transition(.loading)
        log("INFO", "Loading compiled CoreML model.")

        do {
            let model = try MLModel(contentsOf: compiledURL, configuration: configuration)
            log("INFO", "Model loaded successfully.")
            return CoreMLModelLoadResult(model: model, compiledModelURL: compiledURL, originalPackageURL: packageURL)
        } catch {
            throw emitError(.modelLoadFailed(error.localizedDescription))
        }
    }

    // MARK: Downloads

    private func downloadWithFallbacks(descriptor: CoreMLModelDescriptor) async throws -> URL {
        var sourceErrors: [String] = []

        for (sourceIndex, source) in descriptor.remoteSources.enumerated() {
            for retry in 0...maximumRetriesPerSource {
                try throwIfCancelled(for: descriptor)

                do {
                    let resumeData = try readResumeDataIfAny(for: descriptor)
                    let packageURL = try await downloadSingleSource(
                        descriptor: descriptor,
                        source: source,
                        sourceIndex: sourceIndex,
                        resumeData: resumeData
                    )
                    try deleteResumeData(for: descriptor)
                    return packageURL
                } catch {
                    let message = "[\(source.label)] attempt \(retry + 1)/\(maximumRetriesPerSource + 1) failed: \(error.localizedDescription)"
                    log("WARN", message)
                    sourceErrors.append(message)

                    if retry < maximumRetriesPerSource {
                        let delay = retryDelay(forAttempt: retry + 1)
                        transition(.retrying(
                            attempt: retry + 1,
                            maxAttempts: maximumRetriesPerSource + 1,
                            delaySeconds: delay,
                            reason: error.localizedDescription
                        ))
                        try await sleep(seconds: delay)
                        continue
                    }
                }
            }
            try? deleteResumeData(for: descriptor)
        }

        throw emitError(.allSourcesFailed(messages: sourceErrors))
    }

    private func downloadSingleSource(
        descriptor: CoreMLModelDescriptor,
        source: CoreMLModelSource,
        sourceIndex: Int,
        resumeData: Data?
    ) async throws -> URL {
        transition(.preparingDownload)
        log("INFO", "Downloading from source \(sourceIndex + 1)/\(descriptor.remoteSources.count): \(source.label)")
        log("DEBUG", "URL: \(source.url.absoluteString)")

        let destinationURL = cachedPackageURL(for: descriptor)

        if fileManager.fileExists(atPath: destinationURL.path) {
            try? fileManager.removeItem(at: destinationURL)
        }

        return try await withCheckedThrowingContinuation { continuation in
            let task: URLSessionDownloadTask
            if let resumeData, !resumeData.isEmpty {
                log("INFO", "Using resume data.")
                task = urlSession.downloadTask(withResumeData: resumeData)
            } else {
                var request = URLRequest(url: source.url)
                request.timeoutInterval = 60
                task = urlSession.downloadTask(with: request)
            }

            lock.lock()
            activeDownloadContext = ActiveDownloadContext(
                descriptor: descriptor,
                source: source,
                continuation: continuation,
                downloadTask: task,
                receivedBytes: 0,
                expectedBytes: nil,
                lastProgressDate: Date(),
                stallRequested: false
            )
            lock.unlock()

            armStallTimer()
            task.resume()
        }
    }

    // MARK: File Paths

    private func baseModelsDirectory() -> URL {
        let appSupport = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return appSupport.appendingPathComponent("CoreMLModels", isDirectory: true)
    }

    private func cacheDirectory() -> URL {
        let caches = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return caches.appendingPathComponent("CoreMLModels", isDirectory: true)
    }

    private func modelDirectory(for descriptor: CoreMLModelDescriptor) -> URL {
        baseModelsDirectory().appendingPathComponent(descriptor.id, isDirectory: true)
    }

    private func compiledModelURL(for descriptor: CoreMLModelDescriptor) -> URL {
        modelDirectory(for: descriptor).appendingPathComponent(descriptor.compiledFolderName, isDirectory: true)
    }

    private func manifestURL(for descriptor: CoreMLModelDescriptor) -> URL {
        modelDirectory(for: descriptor).appendingPathComponent("manifest.json")
    }

    private func cachedPackageURL(for descriptor: CoreMLModelDescriptor) -> URL {
        cacheDirectory().appendingPathComponent(descriptor.fileName)
    }

    private func resumeDataURL(for descriptor: CoreMLModelDescriptor?) -> URL {
        let fallbackName = descriptor?.fileName ?? "unknown-model"
        return cacheDirectory().appendingPathComponent("\(fallbackName).resume")
    }

    // MARK: Filesystem

    private func prepareDirectories(for descriptor: CoreMLModelDescriptor) throws {
        try ensureDirectory(baseModelsDirectory())
        try ensureDirectory(cacheDirectory())
        try ensureDirectory(modelDirectory(for: descriptor))
    }

    private func ensureDirectory(_ url: URL) throws {
        var isDirectory: ObjCBool = false
        if fileManager.fileExists(atPath: url.path, isDirectory: &isDirectory) {
            if isDirectory.boolValue { return }
            throw emitError(.filesystemFailure("Expected directory but found file at \(url.path)"))
        }
        do {
            try fileManager.createDirectory(at: url, withIntermediateDirectories: true)
        } catch {
            throw emitError(.filesystemFailure("Could not create directory \(url.path): \(error.localizedDescription)"))
        }
    }

    private func purgeCompiledCache(_ descriptor: CoreMLModelDescriptor) throws {
        let compiledURL = compiledModelURL(for: descriptor)
        let manifestURL = manifestURL(for: descriptor)
        if fileManager.fileExists(atPath: compiledURL.path) {
            try? fileManager.removeItem(at: compiledURL)
        }
        if fileManager.fileExists(atPath: manifestURL.path) {
            try? fileManager.removeItem(at: manifestURL)
        }
    }

    // MARK: Resume Data

    private func readResumeDataIfAny(for descriptor: CoreMLModelDescriptor) throws -> Data? {
        let url = resumeDataURL(for: descriptor)
        guard fileManager.fileExists(atPath: url.path) else { return nil }
        let data = try Data(contentsOf: url)
        if data.isEmpty { return nil }
        return data
    }

    private func deleteResumeData(for descriptor: CoreMLModelDescriptor) throws {
        let url = resumeDataURL(for: descriptor)
        if fileManager.fileExists(atPath: url.path) {
            try fileManager.removeItem(at: url)
        }
    }

    private func consumeActiveDownloadContext(taskIdentifier: Int) -> ActiveDownloadContext? {
        lock.lock()
        defer { lock.unlock() }

        guard let context = activeDownloadContext,
              context.downloadTask?.taskIdentifier == taskIdentifier else {
            return nil
        }

        activeDownloadContext = nil
        return context
    }

    private func requestStallCancellationContext() -> ActiveDownloadContext? {
        lock.lock()
        defer { lock.unlock() }

        guard var context = activeDownloadContext else {
            return nil
        }

        context.stallRequested = true
        activeDownloadContext = context
        return context
    }

    // MARK: Helpers

    private func emitError(_ error: CoreMLModelLoaderError) -> CoreMLModelLoaderError {
        transition(.failed(message: error.localizedDescription))
        log("ERROR", error.localizedDescription)
        return error
    }

    private func beginLoadOperation(for descriptor: CoreMLModelDescriptor) throws {
        lock.lock()
        defer { lock.unlock() }

        guard !isLoadInProgress else {
            throw emitError(.unknown("Another model load is already in progress for this loader instance."))
        }

        isLoadInProgress = true
        isCancelled = false
        activeLoadDescriptor = descriptor
    }

    private func endLoadOperation() {
        lock.lock()
        isLoadInProgress = false
        activeLoadDescriptor = nil
        activeDownloadContext = nil
        lock.unlock()
        disarmStallTimer()
    }

    private func throwIfCancelled(for descriptor: CoreMLModelDescriptor) throws {
        lock.lock()
        let cancelled = isCancelled
        lock.unlock()
        if cancelled {
            try? Data().write(to: resumeDataURL(for: descriptor), options: .atomic)
            log("WARN", "Saved cancel marker before aborting current phase.")
            throw emitError(.cancelled)
        }
    }

    private func transition(_ state: CoreMLModelLoaderState) {
        onStateChange?(state)
    }

    private func log(_ level: String, _ message: String) {
        onLog?(CoreMLLoaderLogEntry(level: level, message: message))
    }

    private func retryDelay(forAttempt attempt: Int) -> Double {
        switch attempt {
        case 1: return 2
        case 2: return 5
        case 3: return 10
        default: return 20
        }
    }

    private func sleep(seconds: Double) async throws {
        let nanos = UInt64(seconds * 1_000_000_000)
        try await Task.sleep(nanoseconds: nanos)
    }

    private func sha256File(at url: URL) throws -> String {
        guard let stream = InputStream(url: url) else {
            throw emitError(.filesystemFailure("Could not open file stream for \(url.path)"))
        }

        stream.open()
        defer { stream.close() }

        var hasher = SHA256()
        let bufferSize = 1024 * 1024
        let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
        defer { buffer.deallocate() }

        while stream.hasBytesAvailable {
            let read = stream.read(buffer, maxLength: bufferSize)
            if read < 0 {
                throw emitError(.filesystemFailure("Error reading file for checksum."))
            }
            if read == 0 { break }
            hasher.update(bufferPointer: UnsafeRawBufferPointer(start: buffer, count: read))
        }

        let digest = hasher.finalize()
        return digest.map { String(format: "%02x", $0) }.joined()
    }

    // MARK: Stall Detection

    private func armStallTimer() {
        stallTimer?.cancel()

        let timer = DispatchSource.makeTimerSource(queue: DispatchQueue.global(qos: .utility))
        timer.schedule(deadline: .now() + stallTimeoutSeconds, repeating: stallTimeoutSeconds)

        timer.setEventHandler { [weak self] in
            guard let self else { return }

            self.lock.lock()
            guard let context = self.activeDownloadContext else {
                self.lock.unlock()
                return
            }
            let elapsed = Date().timeIntervalSince(context.lastProgressDate)
            self.lock.unlock()

            guard elapsed >= self.stallTimeoutSeconds,
                  let stallContext = self.requestStallCancellationContext() else { return }

            self.log("ERROR", "Download stalled for \(Int(elapsed))s. Cancelling task.")
            stallContext.downloadTask?.cancel(byProducingResumeData: { [weak self] data in
                guard let self else { return }

                if let data {
                    try? data.write(to: self.resumeDataURL(for: stallContext.descriptor))
                    self.log("WARN", "Stored resume data after stall.")
                }
            })
        }

        stallTimer = timer
        timer.resume()
    }

    private func disarmStallTimer() {
        stallTimer?.cancel()
        stallTimer = nil
    }
}

// MARK: - URLSessionDownloadDelegate

extension CoreMLModelLoader: URLSessionDownloadDelegate, URLSessionTaskDelegate {
    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didWriteData bytesWritten: Int64,
        totalBytesWritten: Int64,
        totalBytesExpectedToWrite: Int64
    ) {
        lock.lock()
        guard var context = activeDownloadContext, context.downloadTask?.taskIdentifier == downloadTask.taskIdentifier else {
            lock.unlock()
            return
        }

        context.receivedBytes = totalBytesWritten
        context.expectedBytes = (totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil)
        context.lastProgressDate = Date()
        activeDownloadContext = context
        lock.unlock()

        let progress: Double
        if totalBytesExpectedToWrite > 0 {
            progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
        } else {
            progress = 0
        }

        transition(.downloading(
            progress: progress,
            receivedBytes: totalBytesWritten,
            expectedBytes: totalBytesExpectedToWrite > 0 ? totalBytesExpectedToWrite : nil
        ))

        let expectedText = totalBytesExpectedToWrite > 0 ? ByteCountFormatter.string(fromByteCount: totalBytesExpectedToWrite, countStyle: .file) : "unknown"
        let receivedText = ByteCountFormatter.string(fromByteCount: totalBytesWritten, countStyle: .file)
        log("DEBUG", "Download progress: \(Int(progress * 100))% (\(receivedText) / \(expectedText))")
    }

    public func urlSession(
        _ session: URLSession,
        downloadTask: URLSessionDownloadTask,
        didFinishDownloadingTo location: URL
    ) {
        disarmStallTimer()

        guard let context = consumeActiveDownloadContext(taskIdentifier: downloadTask.taskIdentifier) else {
            return
        }

        do {
            let destinationURL = cachedPackageURL(for: context.descriptor)
            try ensureDirectory(destinationURL.deletingLastPathComponent())

            if fileManager.fileExists(atPath: destinationURL.path) {
                try fileManager.removeItem(at: destinationURL)
            }

            try fileManager.moveItem(at: location, to: destinationURL)
            log("INFO", "Download finished: \(destinationURL.lastPathComponent)")
            context.continuation.resume(returning: destinationURL)
        } catch {
            let moveError = CoreMLModelLoaderError.filesystemFailure("Could not move downloaded file: \(error.localizedDescription)")
            log("WARN", moveError.localizedDescription)
            context.continuation.resume(throwing: moveError)
        }
    }

    public func urlSession(
        _ session: URLSession,
        task: URLSessionTask,
        didCompleteWithError error: Error?
    ) {
        guard let error else { return }

        disarmStallTimer()

        guard let context = consumeActiveDownloadContext(taskIdentifier: task.taskIdentifier) else {
            return
        }

        let nsError = error as NSError

        if let resumeData = nsError.userInfo[NSURLSessionDownloadTaskResumeData] as? Data {
            try? resumeData.write(to: resumeDataURL(for: context.descriptor))
            log("WARN", "Captured resume data after failure.")
        }

        if nsError.code == NSURLErrorCancelled {
            if context.stallRequested {
                let stalledError = CoreMLModelLoaderError.stalledDownload
                log("ERROR", stalledError.localizedDescription)
                context.continuation.resume(throwing: stalledError)
            } else {
                let cancelledError = CoreMLModelLoaderError.cancelled
                log("WARN", cancelledError.localizedDescription)
                context.continuation.resume(throwing: cancelledError)
            }
            return
        }

        let nonTerminalError = CoreMLModelLoaderError.unknown("Download failed: \(error.localizedDescription)")
        log("WARN", nonTerminalError.localizedDescription)
        context.continuation.resume(throwing: nonTerminalError)
    }
}

// MARK: - Internal Model Manifest

private struct ModelManifest: Codable {
    let id: String
    let displayName: String
    let preset: String
    let originalFileName: String
    let originalSHA256: String?
    let compiledAt: Date
}

private struct ActiveDownloadContext {
    let descriptor: CoreMLModelDescriptor
    let source: CoreMLModelSource
    let continuation: CheckedContinuation<URL, Error>
    let downloadTask: URLSessionDownloadTask?
    var receivedBytes: Int64
    var expectedBytes: Int64?
    var lastProgressDate: Date
    var stallRequested: Bool
}
