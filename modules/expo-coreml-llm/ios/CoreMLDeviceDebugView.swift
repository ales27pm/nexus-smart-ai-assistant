import SwiftUI
import CoreML

struct CoreMLDeviceDebugView: View {
    @StateObject private var vm: CoreMLLoaderViewModel

    init() {
        let descriptors = CoreMLModelCatalog.defaultCatalog()
        _vm = StateObject(wrappedValue: CoreMLLoaderViewModel(descriptors: descriptors))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                GroupBox("On-device CoreML LLM (iOS)") {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("CoreML load state: \(vm.state.userFacingTitle)")
                        Text(progressDescription)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        ProgressView(value: vm.state.progressValue)
                            .progressViewStyle(.linear)

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Model preset")
                            HStack {
                                presetButton(.fp16)
                                presetButton(.int8)
                                presetButton(.int4lut)
                            }
                        }

                        Toggle("CPU-only", isOn: $vm.cpuOnly)

                        HStack(spacing: 12) {
                            Button("Download + load CoreML model") {
                                Task {
                                    await vm.loadSelectedModel()
                                }
                            }
                            .buttonStyle(.borderedProminent)

                            Button("Cancel") {
                                vm.cancel()
                            }
                            .buttonStyle(.bordered)
                        }

                        if vm.loadedModel != nil {
                            Text("Model loaded.")
                                .foregroundStyle(.green)
                        }

                        Divider()

                        Text("Verbose load log")
                            .font(.headline)

                        ScrollView {
                            LazyVStack(alignment: .leading, spacing: 6) {
                                ForEach(vm.logs) { entry in
                                    Text("[\(entry.level)] \(entry.message)")
                                        .font(.system(.caption, design: .monospaced))
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                }
                            }
                        }
                        .frame(minHeight: 220, maxHeight: 320)

                        Button("Clear logs") {
                            vm.clearLogs()
                        }
                        .buttonStyle(.bordered)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Device")
    }

    private var progressDescription: String {
        let percent = Int(vm.state.progressValue * 100)
        switch vm.state {
        case let .downloading(_, received, expected):
            let receivedText = ByteCountFormatter.string(fromByteCount: received, countStyle: .file)
            let expectedText = expected.map { ByteCountFormatter.string(fromByteCount: $0, countStyle: .file) } ?? "unknown"
            return "Progress: \(percent)% (\(receivedText) / \(expectedText))"
        default:
            return "Progress: \(percent)%"
        }
    }

    @ViewBuilder
    private func presetButton(_ preset: CoreMLModelPreset) -> some View {
        Button(preset.rawValue) {
            vm.selectedPreset = preset
        }
        .buttonStyle(.borderedProminent)
        .tint(vm.selectedPreset == preset ? .green : .gray)
    }
}
