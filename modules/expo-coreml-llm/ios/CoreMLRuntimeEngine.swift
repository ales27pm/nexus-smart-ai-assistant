import Foundation
import CoreML

struct CoreMLLoadOptions: Sendable {
    let modelFile: String?
    let modelName: String?
    let modelPath: String?
    let inputIdsName: String
    let attentionMaskName: String
    let cachePositionName: String
    let logitsName: String
    let eosTokenId: Int?
    let maxContext: Int?
    let computeUnits: String

    init(dict: [String: Any]) {
        self.modelFile = dict["modelFile"] as? String
        self.modelName = dict["modelName"] as? String
        self.modelPath = dict["modelPath"] as? String
        self.inputIdsName = (dict["inputIdsName"] as? String) ?? "input_ids"
        self.attentionMaskName = (dict["attentionMaskName"] as? String) ?? "attention_mask"
        self.cachePositionName = (dict["cachePositionName"] as? String) ?? "cache_position"
        self.logitsName = (dict["logitsName"] as? String) ?? "logits"
        self.eosTokenId = dict["eosTokenId"] as? Int
        self.maxContext = dict["maxContext"] as? Int
        self.computeUnits = (dict["computeUnits"] as? String) ?? "all"
    }
}

struct CoreMLGenerateOptionsRecord: Sendable {
    let maxNewTokens: Int
    let temperature: Double
    let topK: Int
    let topP: Double
    let repetitionPenalty: Double
    let stopTokenIds: [Int]
    let seed: Int?
    let maxContext: Int?
    let tokenizer: TokenizerConfig?

    init(dict: [String: Any], includeTokenizer: Bool = true) {
        self.maxNewTokens = dict["maxNewTokens"] as? Int ?? 220
        self.temperature = dict["temperature"] as? Double ?? 0.8
        self.topK = dict["topK"] as? Int ?? 40
        self.topP = dict["topP"] as? Double ?? 0.95
        self.repetitionPenalty = dict["repetitionPenalty"] as? Double ?? 1.05
        self.stopTokenIds = dict["stopTokenIds"] as? [Int] ?? []
        self.seed = dict["seed"] as? Int
        self.maxContext = dict["maxContext"] as? Int
        self.tokenizer = includeTokenizer ? TokenizerConfig(dict: dict["tokenizer"] as? [String: Any] ?? [:]) : nil
    }
}

struct CoreMLSessionStartOptions: Sendable {
    let promptTokenIds: [Int]
    let maxContext: Int?
    let generation: CoreMLGenerateOptionsRecord

    init(dict: [String: Any]) {
        self.promptTokenIds = dict["promptTokenIds"] as? [Int] ?? []
        self.maxContext = dict["maxContext"] as? Int
        self.generation = CoreMLGenerateOptionsRecord(dict: dict["generation"] as? [String: Any] ?? [:], includeTokenizer: false)
    }
}

enum CoreMLRuntimeError: LocalizedError {
    case invalidConfiguration(String, Int)
    case modelNotLoaded
    case busy(String)
    case cancelled
    case unsupportedComputeUnits(String)
    case missingFeatureValue(String)
    case unsupportedInputShape(String)
    case emptyLogits
    case unableToCreateState

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration(let message, _): return message
        case .modelNotLoaded: return "Load the CoreML model first."
        case .busy(let message): return message
        case .cancelled: return "Generation was aborted."
        case .unsupportedComputeUnits(let value): return "Unsupported computeUnits value: \(value)"
        case .missingFeatureValue(let name): return "CoreML output is missing feature '\(name)'."
        case .unsupportedInputShape(let name): return "Unsupported CoreML input shape for '\(name)'."
        case .emptyLogits: return "CoreML logits output is empty."
        case .unableToCreateState: return "CoreML model did not provide a mutable generation state."
        }
    }

    var code: Int {
        switch self {
        case .invalidConfiguration(_, let code): return code
        case .modelNotLoaded: return 20
        case .busy: return 1001
        case .cancelled: return 1002
        case .unsupportedComputeUnits: return 104
        case .missingFeatureValue: return 101
        case .unsupportedInputShape: return 104
        case .emptyLogits: return 101
        case .unableToCreateState: return 104
        }
    }
}

struct LoadedModelInfo: Sendable {
    let compiledURL: URL
    let sourceModelURL: URL?
    let computeUnits: String
    let expectsSingleToken: Bool
    let hasState: Bool
    let inputIdsName: String
    let attentionMaskName: String
    let cachePositionName: String
    let logitsName: String
    let eosTokenId: Int?
    let maxContext: Int?
}

struct RuntimeMetrics: Sendable {
    var prefillTokensPerSecond: Double = 0
    var decodeTokensPerSecond: Double = 0
    var acceptedSpeculativeTokens: Int = 0
    var rejectedSpeculativeTokens: Int = 0
    var kvPagesInUse: Int = 0
    var activeContextLength: Int = 0
    var avgTokenLatencyMS: Double = 0
    var peakMemoryBytes: Int64 = 0
    var generatedTokens: Int = 0
    var reusedPrefixTokens: Int = 0
    var timeToFirstTokenMS: Double = 0

    func asDictionary() -> [String: Any] {
        [
            "prefillTokensPerSecond": prefillTokensPerSecond,
            "decodeTokensPerSecond": decodeTokensPerSecond,
            "acceptedSpeculativeTokens": acceptedSpeculativeTokens,
            "rejectedSpeculativeTokens": rejectedSpeculativeTokens,
            "kvPagesInUse": kvPagesInUse,
            "activeContextLength": activeContextLength,
            "avgTokenLatencyMS": avgTokenLatencyMS,
            "peakMemoryBytes": peakMemoryBytes,
            "generatedTokens": generatedTokens,
            "reusedPrefixTokens": reusedPrefixTokens,
            "timeToFirstTokenMS": timeToFirstTokenMS
        ]
    }
}

struct PagedTokenArena: Sendable {
    struct Page: Sendable {
        let tokenStart: Int
        var tokens: [Int]
    }

    let pageSize: Int
    private(set) var pages: [Page] = []

    init(pageSize: Int = 128) {
        self.pageSize = pageSize
    }

    var tokenCount: Int {
        pages.reduce(0) { $0 + $1.tokens.count }
    }

    var allTokens: [Int] {
        pages.flatMap(\.tokens)
    }

    mutating func rebuild(from tokens: [Int]) {
        pages.removeAll(keepingCapacity: true)
        guard !tokens.isEmpty else { return }
        var cursor = 0
        while cursor < tokens.count {
            let end = min(cursor + pageSize, tokens.count)
            pages.append(Page(tokenStart: cursor, tokens: Array(tokens[cursor..<end])))
            cursor = end
        }
    }

    mutating func append(_ token: Int) {
        if var last = pages.last, last.tokens.count < pageSize {
            last.tokens.append(token)
            pages[pages.count - 1] = last
            return
        }
        pages.append(Page(tokenStart: tokenCount, tokens: [token]))
    }

    mutating func trimToLast(_ maxCount: Int) {
        guard maxCount > 0 else {
            pages.removeAll(keepingCapacity: true)
            return
        }
        let tokens = allTokens
        let trimmed = tokens.count > maxCount ? Array(tokens.suffix(maxCount)) : tokens
        rebuild(from: trimmed)
    }
}

struct PromptPrefixKey: Hashable, Sendable {
    let modelID: String
    let tokenizerID: String
}

struct PrefixSnapshot: Sendable {
    let key: PromptPrefixKey
    let tokens: [Int]
    let createdAt: Date
}

actor PromptPrefixCache {
    private let capacity: Int
    private var snapshots: [PromptPrefixKey: PrefixSnapshot] = [:]
    private var order: [PromptPrefixKey] = []

    init(capacity: Int = 6) {
        self.capacity = capacity
    }

    func store(_ snapshot: PrefixSnapshot) {
        snapshots[snapshot.key] = snapshot
        order.removeAll { $0 == snapshot.key }
        order.append(snapshot.key)
        while order.count > capacity {
            let removed = order.removeFirst()
            snapshots.removeValue(forKey: removed)
        }
    }

    func longestReusablePrefix(modelID: String, tokenizerID: String, promptTokenIds: [Int]) -> Int {
        var best = 0
        for key in order.reversed() {
            guard key.modelID == modelID, key.tokenizerID == tokenizerID,
                  let snapshot = snapshots[key] else { continue }
            let prefix = longestCommonPrefix(snapshot.tokens, promptTokenIds)
            if prefix > best {
                best = prefix
            }
        }
        return best
    }

    private func longestCommonPrefix(_ lhs: [Int], _ rhs: [Int]) -> Int {
        let maxLen = min(lhs.count, rhs.count)
        var index = 0
        while index < maxLen && lhs[index] == rhs[index] {
            index += 1
        }
        return index
    }
}

actor CancellationSource {
    private var cancelled = false

    func reset() {
        cancelled = false
    }

    func cancel() {
        cancelled = true
    }

    func throwIfCancelled() throws {
        if cancelled {
            throw CoreMLRuntimeError.cancelled
        }
    }
}

private struct InferenceOutput {
    let logits: [Float]
    let sequenceLength: Int
}

private struct GenerationSession {
    var promptTokens: [Int]
    var arena: PagedTokenArena
    var options: CoreMLGenerateOptionsRecord
    var maxContext: Int
    var stopTokenIds: Set<Int>
    var eosTokenId: Int?
    var state: AnyObject?
    var pendingLogits: [Float]?
    var metrics: RuntimeMetrics
    var startedAt: Date
    var firstTokenAt: Date?
}

private struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed == 0 ? 0xdeadbeefcafebabe : seed
    }

    mutating func next() -> UInt64 {
        state = 2862933555777941757 &* state &+ 3037000493
        return state
    }
}

/// CoreMLRuntimeEngine is not thread-safe: mutable state in `loadedModel`, `loadedInfo`,
/// `activeSession`, and `lastMetrics` must be externally serialized.
/// Use it through `CoreMLRuntimeActor` and avoid direct concurrent access or direct
/// instantiation from outside that actor wrapper.
final class CoreMLRuntimeEngine {
    private let prefixCache = PromptPrefixCache()
    private let cancellation = CancellationSource()

    private var loadedModel: MLModel?
    private var loadedInfo: LoadedModelInfo?
    private var activeSession: GenerationSession?
    private var lastMetrics = RuntimeMetrics()
    private let fileManager = FileManager.default

    func loadModel(options: CoreMLLoadOptions) async throws -> LoadedModelInfo {
        await cancellation.reset()
        activeSession = nil

        let modelURL = try resolveSourceModelURL(options: options)
        let compiledURL = try compiledModelURL(for: modelURL)
        let configuration = MLModelConfiguration()
        configuration.computeUnits = try mapComputeUnits(options.computeUnits)

        let model = try MLModel(contentsOf: compiledURL, configuration: configuration)

        let expectsSingleToken = inferExpectsSingleToken(model: model, inputName: options.inputIdsName)
        let hasState: Bool
        if #available(iOS 18.0, *) {
            hasState = !model.modelDescription.stateDescriptionsByName.isEmpty
        } else {
            hasState = false
        }

        let info = LoadedModelInfo(
            compiledURL: compiledURL,
            sourceModelURL: modelURL,
            computeUnits: options.computeUnits,
            expectsSingleToken: expectsSingleToken,
            hasState: hasState,
            inputIdsName: options.inputIdsName,
            attentionMaskName: options.attentionMaskName,
            cachePositionName: options.cachePositionName,
            logitsName: options.logitsName,
            eosTokenId: options.eosTokenId,
            maxContext: options.maxContext
        )

        self.loadedModel = model
        self.loadedInfo = info
        self.lastMetrics = RuntimeMetrics()
        return info
    }

    func unloadModel() async {
        loadedModel = nil
        loadedInfo = nil
        activeSession = nil
        lastMetrics = RuntimeMetrics()
        await cancellation.cancel()
    }

    func isLoaded() -> Bool {
        loadedModel != nil
    }

    func tokenize(prompt: String, config: TokenizerConfig) throws -> [Int] {
        let tokenizer = try CoreMLTokenizerFactory.shared.makeTokenizer(config: config)
        return try tokenizer.encode(prompt)
    }

    func decode(tokenIds: [Int], config: TokenizerConfig) throws -> String {
        let tokenizer = try CoreMLTokenizerFactory.shared.makeTokenizer(config: config)
        return try tokenizer.decode(tokenIds)
    }

    func generate(prompt: String, options: CoreMLGenerateOptionsRecord) async throws -> String {
        guard let tokenizerConfig = options.tokenizer else {
            throw CoreMLRuntimeError.invalidConfiguration("Tokenizer required for this model. Pass tokenizer settings with vocab/merges assets.", 122)
        }
        let tokenizer = try CoreMLTokenizerFactory.shared.makeTokenizer(config: tokenizerConfig)
        let promptTokenIds = try tokenizer.encode(prompt)
        let generatedTokenIds = try await generateFromTokens(promptTokenIds: promptTokenIds, options: options)
        return try tokenizer.decode(generatedTokenIds)
    }

    func generateFromTokens(promptTokenIds: [Int], options: CoreMLGenerateOptionsRecord) async throws -> [Int] {
        try await beginSession(options: CoreMLSessionStartOptions(dict: [
            "promptTokenIds": promptTokenIds,
            "maxContext": options.maxContext as Any,
            "generation": [
                "maxNewTokens": options.maxNewTokens,
                "temperature": options.temperature,
                "topK": options.topK,
                "topP": options.topP,
                "repetitionPenalty": options.repetitionPenalty,
                "stopTokenIds": options.stopTokenIds,
                "seed": options.seed as Any,
                "maxContext": options.maxContext as Any,
            ]
        ]))

        var output: [Int] = []
        while output.count < options.maxNewTokens {
            guard let token = try await generateNextToken() else { break }
            output.append(token)
            if options.stopTokenIds.contains(token) { break }
            if let eos = loadedInfo?.eosTokenId, token == eos { break }
        }
        await endSession()
        return output
    }

    func beginSession(options: CoreMLSessionStartOptions) async throws -> Bool {
        guard let model = loadedModel, let info = loadedInfo else {
            throw CoreMLRuntimeError.modelNotLoaded
        }
        await cancellation.reset()

        let defaultMaxContext = max(1, info.maxContext ?? 2048)
        let maxContext = max(1, options.maxContext ?? options.generation.maxContext ?? defaultMaxContext)
        let prompt = options.promptTokenIds.count > maxContext
            ? Array(options.promptTokenIds.suffix(maxContext))
            : options.promptTokenIds

        var arena = PagedTokenArena(pageSize: 128)
        arena.rebuild(from: prompt)

        let tokenizerID = options.generation.tokenizer?.kind ?? "native-token-ids"
        let reusedPrefixTokens = await prefixCache.longestReusablePrefix(
            modelID: info.compiledURL.lastPathComponent,
            tokenizerID: tokenizerID,
            promptTokenIds: prompt
        )

        var session = GenerationSession(
            promptTokens: prompt,
            arena: arena,
            options: options.generation,
            maxContext: maxContext,
            stopTokenIds: Set(options.generation.stopTokenIds),
            eosTokenId: info.eosTokenId,
            state: nil,
            pendingLogits: nil,
            metrics: RuntimeMetrics(),
            startedAt: Date(),
            firstTokenAt: nil
        )
        session.metrics.kvPagesInUse = arena.pages.count
        session.metrics.activeContextLength = arena.tokenCount
        session.metrics.reusedPrefixTokens = reusedPrefixTokens

        let prefillStart = Date()
        if info.hasState {
            session.state = try makeStateIfAvailable(model: model)
            session.pendingLogits = try await performStatefulPrefill(model: model, info: info, session: &session)
        } else {
            session.pendingLogits = try predictLogits(model: model, info: info, tokenIds: prompt, state: nil, positionOffset: 0).logits
        }
        let prefillElapsed = max(Date().timeIntervalSince(prefillStart), 0.0001)
        session.metrics.prefillTokensPerSecond = Double(max(prompt.count, 1)) / prefillElapsed
        activeSession = session

        await prefixCache.store(PrefixSnapshot(
            key: PromptPrefixKey(modelID: info.compiledURL.lastPathComponent, tokenizerID: tokenizerID),
            tokens: prompt,
            createdAt: Date()
        ))

        lastMetrics = session.metrics
        return true
    }

    func generateNextToken() async throws -> Int? {
        try await cancellation.throwIfCancelled()
        guard var session = activeSession,
              let model = loadedModel,
              let info = loadedInfo else {
            throw CoreMLRuntimeError.modelNotLoaded
        }
        guard session.metrics.generatedTokens < session.options.maxNewTokens else {
            activeSession = session
            lastMetrics = session.metrics
            return nil
        }
        guard let logits = session.pendingLogits, !logits.isEmpty else {
            return nil
        }

        let decodeStart = Date()
        let sampled = sampleToken(
            logits: logits,
            history: session.arena.allTokens,
            options: session.options
        )

        if session.firstTokenAt == nil {
            session.firstTokenAt = Date()
            session.metrics.timeToFirstTokenMS = session.firstTokenAt?.timeIntervalSince(session.startedAt) * 1000 ?? 0
        }

        session.arena.append(sampled)
        session.arena.trimToLast(session.maxContext)
        session.metrics.kvPagesInUse = session.arena.pages.count
        session.metrics.activeContextLength = session.arena.tokenCount
        session.metrics.generatedTokens += 1

        let priorLatency = session.metrics.avgTokenLatencyMS * Double(max(session.metrics.generatedTokens - 1, 0))
        let currentLatency = Date().timeIntervalSince(decodeStart) * 1000
        session.metrics.avgTokenLatencyMS = (priorLatency + currentLatency) / Double(max(session.metrics.generatedTokens, 1))

        let promptCount = session.promptTokens.count
        let positionForNextToken = max(0, promptCount + session.metrics.generatedTokens - 1)

        if session.stopTokenIds.contains(sampled) || (session.eosTokenId != nil && sampled == session.eosTokenId) {
            session.pendingLogits = nil
        } else if info.hasState {
            let stepStart = Date()
            session.pendingLogits = try predictLogits(
                model: model,
                info: info,
                tokenIds: [sampled],
                state: session.state,
                positionOffset: positionForNextToken
            ).logits
            let elapsed = max(Date().timeIntervalSince(stepStart), 0.0001)
            session.metrics.decodeTokensPerSecond = 1.0 / elapsed
        } else {
            let contextTokens = session.arena.allTokens
            let stepStart = Date()
            session.pendingLogits = try predictLogits(
                model: model,
                info: info,
                tokenIds: contextTokens,
                state: nil,
                positionOffset: 0
            ).logits
            let elapsed = max(Date().timeIntervalSince(stepStart), 0.0001)
            session.metrics.decodeTokensPerSecond = 1.0 / elapsed
        }

        activeSession = session
        lastMetrics = session.metrics
        return sampled
    }

    func endSession() async {
        activeSession = nil
    }

    func cancel() async {
        await cancellation.cancel()
        activeSession = nil
    }

    func currentInfo() -> LoadedModelInfo? {
        loadedInfo
    }

    func metricsSnapshot() -> RuntimeMetrics {
        if let session = activeSession {
            return session.metrics
        }
        return lastMetrics
    }

    // MARK: - Private

    private func resolveSourceModelURL(options: CoreMLLoadOptions) throws -> URL {
        if let explicitPath = options.modelPath?.trimmingCharacters(in: .whitespacesAndNewlines), !explicitPath.isEmpty {
            let expanded = (explicitPath as NSString).expandingTildeInPath
            guard fileManager.fileExists(atPath: expanded) else {
                throw CoreMLRuntimeError.invalidConfiguration("CoreML model file not found in bundle or at supplied modelPath: \(explicitPath)", 22)
            }
            return URL(fileURLWithPath: expanded)
        }

        if let modelFile = options.modelFile?.trimmingCharacters(in: .whitespacesAndNewlines), !modelFile.isEmpty {
            let bundleCandidates = [Bundle.main, Bundle(for: CoreMLModelLoader.self)]
            for bundle in bundleCandidates {
                if let resourceURL = bundle.resourceURL?.appendingPathComponent(modelFile), fileManager.fileExists(atPath: resourceURL.path) {
                    return resourceURL
                }
            }
            throw CoreMLRuntimeError.invalidConfiguration("CoreML model resource missing. Provide modelPath from prepared assets and retry.", 101)
        }

        throw CoreMLRuntimeError.invalidConfiguration("CoreML modelPath is required and must come from prepared/downloaded assets.", 20)
    }

    private func compiledModelURL(for sourceURL: URL) throws -> URL {
        if sourceURL.pathExtension == "mlmodelc" {
            return sourceURL
        }

        let cachesDir = fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("CoreMLCompiled", isDirectory: true)
        try fileManager.createDirectory(at: cachesDir, withIntermediateDirectories: true, attributes: nil)

        let fingerprint = Self.hashString(sourceURL.path + "|" + sourceURL.lastPathComponent)
        let destination = cachesDir.appendingPathComponent("\(fingerprint).mlmodelc", isDirectory: true)
        if fileManager.fileExists(atPath: destination.path) {
            return destination
        }

        do {
            let compiledTemp = try MLModel.compileModel(at: sourceURL)
            if fileManager.fileExists(atPath: destination.path) {
                try? fileManager.removeItem(at: destination)
            }
            try fileManager.copyItem(at: compiledTemp, to: destination)
            return destination
        } catch {
            throw CoreMLRuntimeError.invalidConfiguration("CoreML model compilation failed before load. Verify downloaded model assets are complete/compatible, clear stale compiled cache, and retry. (\(error.localizedDescription))", 105)
        }
    }

    private func mapComputeUnits(_ value: String) throws -> MLComputeUnits {
        switch value {
        case "all": return .all
        case "cpuOnly": return .cpuOnly
        case "cpuAndGPU": return .cpuAndGPU
        case "cpuAndNeuralEngine":
            if #available(iOS 17.0, *) {
                return .cpuAndNeuralEngine
            }
            return .all
        default:
            throw CoreMLRuntimeError.unsupportedComputeUnits(value)
        }
    }

    private func inferExpectsSingleToken(model: MLModel, inputName: String) -> Bool {
        let feature = model.modelDescription.inputDescriptionsByName[inputName]
        guard let multiArray = feature?.multiArrayConstraint else { return false }
        let shape = multiArray.shape.map(\.intValue)
        guard let last = shape.last else { return false }
        return last == 1
    }

    private func makeStateIfAvailable(model: MLModel) throws -> AnyObject? {
        if #available(iOS 18.0, *) {
            return try model.makeState()
        }
        return nil
    }

    private func performStatefulPrefill(model: MLModel, info: LoadedModelInfo, session: inout GenerationSession) async throws -> [Float] {
        guard !session.promptTokens.isEmpty else {
            throw CoreMLRuntimeError.invalidConfiguration("Prompt token ids must not be empty.", 120)
        }

        var lastLogits: [Float] = []
        for (index, token) in session.promptTokens.enumerated() {
            try await cancellation.throwIfCancelled()
            let result = try predictLogits(
                model: model,
                info: info,
                tokenIds: [token],
                state: session.state,
                positionOffset: index
            )
            lastLogits = result.logits
        }
        return lastLogits
    }

    private func predictLogits(
        model: MLModel,
        info: LoadedModelInfo,
        tokenIds: [Int],
        state: AnyObject?,
        positionOffset: Int
    ) throws -> InferenceOutput {
        guard !tokenIds.isEmpty else {
            throw CoreMLRuntimeError.invalidConfiguration("Token ids must not be empty for CoreML inference.", 120)
        }

        let modelDescription = model.modelDescription
        var features: [String: MLFeatureValue] = [:]

        if modelDescription.inputDescriptionsByName[info.inputIdsName] != nil {
            features[info.inputIdsName] = try MLFeatureValue(multiArray: makeTokenArray(name: info.inputIdsName, tokenIds: tokenIds, modelDescription: modelDescription))
        }

        if modelDescription.inputDescriptionsByName[info.attentionMaskName] != nil {
            let attentionLength = positionOffset + tokenIds.count
            features[info.attentionMaskName] = try MLFeatureValue(multiArray: makeBinaryMaskArray(name: info.attentionMaskName, length: max(1, attentionLength), modelDescription: modelDescription))
        }

        if modelDescription.inputDescriptionsByName[info.cachePositionName] != nil {
            let positions = Array(positionOffset..<(positionOffset + tokenIds.count))
            features[info.cachePositionName] = try MLFeatureValue(multiArray: makePositionArray(name: info.cachePositionName, positions: positions, modelDescription: modelDescription))
        }

        let provider = try MLDictionaryFeatureProvider(dictionary: features)
        let output: MLFeatureProvider
        if #available(iOS 18.0, *), info.hasState, let typedState = state as? MLState {
            output = try model.prediction(from: provider, options: MLPredictionOptions(), state: typedState)
        } else {
            output = try model.prediction(from: provider)
        }

        guard let logitsArray = output.featureValue(for: info.logitsName)?.multiArrayValue else {
            throw CoreMLRuntimeError.missingFeatureValue(info.logitsName)
        }
        let logits = try flattenLastLogits(logitsArray)
        guard !logits.isEmpty else {
            throw CoreMLRuntimeError.emptyLogits
        }
        return InferenceOutput(logits: logits, sequenceLength: tokenIds.count)
    }

    private func makeTokenArray(name: String, tokenIds: [Int], modelDescription: MLModelDescription) throws -> MLMultiArray {
        let shape = inferShape(name: name, modelDescription: modelDescription, count: tokenIds.count, allowScalar: false)
        let array = try MLMultiArray(shape: shape.map { NSNumber(value: $0) }, dataType: .int32)
        let flatCount = shape.reduce(1, *)
        guard flatCount >= tokenIds.count else {
            throw CoreMLRuntimeError.unsupportedInputShape(name)
        }
        for index in 0..<flatCount {
            array[index] = NSNumber(value: index < tokenIds.count ? tokenIds[index] : 0)
        }
        return array
    }

    private func makeBinaryMaskArray(name: String, length: Int, modelDescription: MLModelDescription) throws -> MLMultiArray {
        let shape = inferShape(name: name, modelDescription: modelDescription, count: length, allowScalar: false)
        let array = try MLMultiArray(shape: shape.map { NSNumber(value: $0) }, dataType: .int32)
        let flatCount = shape.reduce(1, *)
        for index in 0..<flatCount {
            array[index] = NSNumber(value: index < length ? 1 : 0)
        }
        return array
    }

    private func makePositionArray(name: String, positions: [Int], modelDescription: MLModelDescription) throws -> MLMultiArray {
        let shape = inferShape(name: name, modelDescription: modelDescription, count: positions.count, allowScalar: true)
        let array = try MLMultiArray(shape: shape.map { NSNumber(value: $0) }, dataType: .int32)
        let flatCount = shape.reduce(1, *)
        for index in 0..<flatCount {
            let value = positions.isEmpty ? 0 : positions[min(index, positions.count - 1)]
            array[index] = NSNumber(value: value)
        }
        return array
    }

    private func inferShape(name: String, modelDescription: MLModelDescription, count: Int, allowScalar: Bool) -> [Int] {
        guard let feature = modelDescription.inputDescriptionsByName[name], let constraint = feature.multiArrayConstraint else {
            return allowScalar ? [max(1, count)] : [1, max(1, count)]
        }
        let rawShape = constraint.shape.map(\.intValue)
        guard !rawShape.isEmpty else {
            return allowScalar ? [max(1, count)] : [1, max(1, count)]
        }
        if rawShape.count == 1 {
            if rawShape[0] == 1 && allowScalar {
                return [1]
            }
            return [max(1, count)]
        }
        var shape = rawShape.map { max(1, $0) }
        if let last = shape.indices.last {
            shape[last] = max(1, count)
        }
        if shape.count >= 2, shape[0] <= 0 { shape[0] = 1 }
        return shape
    }

    private func flattenLastLogits(_ array: MLMultiArray) throws -> [Float] {
        let shape = array.shape.map(\.intValue)
        guard let vocabSize = shape.last, vocabSize > 0 else {
            throw CoreMLRuntimeError.emptyLogits
        }
        if shape.count == 1 {
            return (0..<vocabSize).map { Float(truncating: array[$0]) }
        }

        let lastIndex = shape.count - 1
        var baseIndices = Array(repeating: 0, count: shape.count)
        for index in 0..<lastIndex {
            baseIndices[index] = shape[index] > 1 ? shape[index] - 1 : 0
        }

        var vector: [Float] = []
        vector.reserveCapacity(vocabSize)
        for vocabIndex in 0..<vocabSize {
            baseIndices[lastIndex] = vocabIndex
            let nsIndices = baseIndices.map { NSNumber(value: $0) }
            vector.append(Float(truncating: array[nsIndices]))
        }
        return vector
    }

    private func sampleToken(logits: [Float], history: [Int], options: CoreMLGenerateOptionsRecord) -> Int {
        var adjusted = logits
        let temperature = max(0.0001, Float(options.temperature))
        let repetitionPenalty = max(0.0001, Float(options.repetitionPenalty))

        if repetitionPenalty != 1.0 && !history.isEmpty {
            var tokenCounts: [Int: Int] = [:]
            for token in history.suffix(256) {
                tokenCounts[token, default: 0] += 1
            }
            for (token, count) in tokenCounts where token >= 0 && token < adjusted.count {
                let penalty = powf(repetitionPenalty, Float(count))
                adjusted[token] = adjusted[token] >= 0 ? adjusted[token] / penalty : adjusted[token] * penalty
            }
        }

        let maxLogit = adjusted.max() ?? 0
        var probs = adjusted.map { expf(($0 - maxLogit) / temperature) }
        let sum = probs.reduce(0, +)
        if sum.isFinite && sum > 0 {
            probs = probs.map { $0 / sum }
        }

        let sorted = probs.enumerated().sorted { $0.element > $1.element }
        let limitedTopK = options.topK > 0 ? Array(sorted.prefix(options.topK)) : sorted

        var cumulative: Float = 0
        var nucleus: [(index: Int, prob: Float)] = []
        nucleus.reserveCapacity(limitedTopK.count)
        let topP = Float(max(0.0, min(1.0, options.topP)))
        for entry in limitedTopK {
            cumulative += entry.element
            nucleus.append((entry.offset, entry.element))
            if cumulative >= topP { break }
        }
        if nucleus.isEmpty, let best = limitedTopK.first {
            return best.offset
        }

        let total = nucleus.reduce(Float(0)) { $0 + $1.prob }
        guard total > 0 else { return nucleus.first?.index ?? 0 }

        let seedValue = (options.seed ?? history.count) &+ 1
        var rng = SeededGenerator(seed: UInt64(seedValue))
        let threshold = Float.random(in: 0..<total, using: &rng)
        var running: Float = 0
        for candidate in nucleus {
            running += candidate.prob
            if threshold <= running {
                return candidate.index
            }
        }
        return nucleus.last?.index ?? 0
    }

    private static func hashString(_ value: String) -> String {
        value.data(using: .utf8)?.base64EncodedString().replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "+", with: "-") ?? value
    }

}
