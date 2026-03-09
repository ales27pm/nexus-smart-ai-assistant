import Foundation

enum CoreMLModelCatalog {
    static func defaultCatalog() -> [CoreMLModelPreset: CoreMLModelDescriptor] {
        [
            .fp16: CoreMLModelDescriptor(
                id: "dolphin3-3b-fp16",
                displayName: "Dolphin3.0 Llama3.2 3B FP16",
                preset: .fp16,
                remoteSources: [
                    CoreMLModelSource(
                        url: URL(string: "https://huggingface.co/ales27pm/Dolphin3.0-CoreML/resolve/main/Dolphin3.0-Llama3.2-3B-fp16.mlpackage")!,
                        label: "HuggingFace"
                    ),
                    CoreMLModelSource(
                        url: URL(string: "https://github.com/ales27pm/Dolphin3.0-CoreML/releases/download/v1/Dolphin3.0-Llama3.2-3B-fp16.mlpackage")!,
                        label: "GitHub Release Mirror"
                    )
                ],
                sha256: nil,
                bundledResourceName: nil,
                bundledResourceExtension: nil,
                fileName: "Dolphin3.0-Llama3.2-3B-fp16.mlpackage",
                compiledFolderName: "Dolphin3.0-Llama3.2-3B-fp16.mlmodelc"
            ),

            .int8: CoreMLModelDescriptor(
                id: "dolphin3-3b-int8",
                displayName: "Dolphin3.0 Llama3.2 3B INT8",
                preset: .int8,
                remoteSources: [
                    CoreMLModelSource(
                        url: URL(string: "https://huggingface.co/ales27pm/Dolphin3.0-CoreML/resolve/main/Dolphin3.0-Llama3.2-3B-int8.mlpackage")!,
                        label: "HuggingFace"
                    ),
                    CoreMLModelSource(
                        url: URL(string: "https://github.com/ales27pm/Dolphin3.0-CoreML/releases/download/v1/Dolphin3.0-Llama3.2-3B-int8.mlpackage")!,
                        label: "GitHub Release Mirror"
                    )
                ],
                sha256: nil,
                bundledResourceName: nil,
                bundledResourceExtension: nil,
                fileName: "Dolphin3.0-Llama3.2-3B-int8.mlpackage",
                compiledFolderName: "Dolphin3.0-Llama3.2-3B-int8.mlmodelc"
            ),

            .int4lut: CoreMLModelDescriptor(
                id: "dolphin3-3b-int4-lut",
                displayName: "Dolphin3.0 Llama3.2 3B INT4-LUT",
                preset: .int4lut,
                remoteSources: [
                    CoreMLModelSource(
                        url: URL(string: "https://huggingface.co/ales27pm/Dolphin3.0-CoreML/resolve/main/Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage")!,
                        label: "HuggingFace"
                    ),
                    CoreMLModelSource(
                        url: URL(string: "https://github.com/ales27pm/Dolphin3.0-CoreML/releases/download/v1/Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage")!,
                        label: "GitHub Release Mirror"
                    )
                ],
                sha256: nil,
                bundledResourceName: nil,
                bundledResourceExtension: nil,
                fileName: "Dolphin3.0-Llama3.2-3B-int4-lut.mlpackage",
                compiledFolderName: "Dolphin3.0-Llama3.2-3B-int4-lut.mlmodelc"
            )
        ]
    }
}
