import Foundation
import CoreML

#if canImport(Combine)
import Combine

@MainActor
public final class CoreMLLoaderViewModel: ObservableObject {
    @Published public var selectedPreset: CoreMLModelPreset = .int4lut
    @Published public private(set) var state: CoreMLModelLoaderState = .idle
    @Published public private(set) var logs: [CoreMLLoaderLogEntry] = []
    @Published public private(set) var loadedModel: MLModel?
    @Published public var cpuOnly: Bool = false

    private let store: CoreMLModelLoaderStore
    private let descriptors: [CoreMLModelPreset: CoreMLModelDescriptor]
    private var cancellables = Set<AnyCancellable>()

    public init(descriptors: [CoreMLModelPreset: CoreMLModelDescriptor]) {
        let loader = CoreMLModelLoader()
        self.store = CoreMLModelLoaderStore(loader: loader)
        self.descriptors = descriptors

        store.$state
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.state = $0 }
            .store(in: &cancellables)

        store.$logs
            .receive(on: DispatchQueue.main)
            .sink { [weak self] in self?.logs = $0 }
            .store(in: &cancellables)
    }

    public func loadSelectedModel() async {
        loadedModel = nil

        guard let descriptor = descriptors[selectedPreset] else {
            return
        }

        let config = MLModelConfiguration()
        if #available(iOS 16.0, *) {
            config.computeUnits = cpuOnly ? .cpuOnly : .all
        } else {
            config.computeUnits = cpuOnly ? .cpuOnly : .cpuAndGPU
        }

        let result = await store.loadModel(descriptor, configuration: config)
        self.loadedModel = result?.model
    }

    public func cancel() {
        loadedModel = nil
        store.cancel()
    }

    public func clearLogs() {
        store.clearLogs()
    }
}
#endif
