import Foundation

enum ResourceResolver {
  static func resourceBundle() -> Bundle? {
    let moduleBundle = Bundle(for: ExpoCoreMLLLMModule.self)

    if let url = moduleBundle.url(forResource: "ExpoCoreMLLLMResources", withExtension: "bundle"),
       let b = Bundle(url: url) {
      return b
    }

    if let url = Bundle.main.url(forResource: "ExpoCoreMLLLMResources", withExtension: "bundle"),
       let b = Bundle(url: url) {
      return b
    }

    return nil
  }

  static func resolveModuleAssetPath(_ path: String) throws -> URL {
    if path.hasPrefix("file://") {
      let filePath = String(path.dropFirst("file://".count))
      return URL(fileURLWithPath: filePath)
    }

    if path.hasPrefix("/") {
      return URL(fileURLWithPath: path)
    }

    let cleaned = path.hasPrefix("module:") ? String(path.dropFirst("module:".count)) : path

    guard let b = resourceBundle() else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 10, userInfo: [
        NSLocalizedDescriptionKey: "Resource bundle ExpoCoreMLLLMResources.bundle not found. Ensure pods installed and module is autolinked."
      ])
    }

    if let url = b.url(forResource: cleaned, withExtension: nil) {
      return url
    }

    let parts = cleaned.split(separator: "/").map(String.init)
    guard let file = parts.last else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 11, userInfo: [NSLocalizedDescriptionKey: "Invalid asset path: \(path)"])
    }

    let dir = parts.dropLast().joined(separator: "/")
    let fileParts = file.split(separator: ".").map(String.init)

    if fileParts.count >= 2 {
      let ext = fileParts.last!
      let name = fileParts.dropLast().joined(separator: ".")
      if let url = b.url(forResource: name, withExtension: ext, subdirectory: dir.isEmpty ? nil : dir) {
        return url
      }
    } else if let url = b.url(forResource: file, withExtension: nil, subdirectory: dir.isEmpty ? nil : dir) {
      return url
    }

    throw NSError(domain: "ExpoCoreMLLLM", code: 12, userInfo: [
      NSLocalizedDescriptionKey: "Asset not found in resource bundle: \(path) (looked for \(cleaned))"
    ])
  }

  static func resolveModelURL(modelFile: String?, modelPath: String?) throws -> URL {
    if let p = modelPath, !p.isEmpty {
      return try resolveModuleAssetPath(p)
    }

    guard let file = modelFile, !file.isEmpty else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 20, userInfo: [
        NSLocalizedDescriptionKey: "modelFile is required when modelPath is not provided"
      ])
    }

    guard let b = resourceBundle() else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 21, userInfo: [NSLocalizedDescriptionKey: "Resource bundle not found"])
    }

    if file.hasSuffix(".mlpackage") {
      let name = String(file.dropLast(".mlpackage".count))
      if let url = b.url(forResource: name, withExtension: "mlpackage", subdirectory: "models") {
        return url
      }
    }

    if file.hasSuffix(".mlmodelc") {
      let name = String(file.dropLast(".mlmodelc".count))
      if let url = b.url(forResource: name, withExtension: "mlmodelc", subdirectory: "models") {
        return url
      }
    }

    let parts = file.split(separator: "/").map(String.init)
    if let leaf = parts.last {
      let dir = (["models"] + parts.dropLast()).joined(separator: "/")
      let split = leaf.split(separator: ".").map(String.init)
      if split.count >= 2 {
        let ext = split.last!
        let name = split.dropLast().joined(separator: ".")
        if let url = b.url(forResource: name, withExtension: ext, subdirectory: dir) {
          return url
        }
      }
    }

    throw NSError(domain: "ExpoCoreMLLLM", code: 22, userInfo: [
      NSLocalizedDescriptionKey: "Model \(file) not found in ios/resources/models."
    ])
  }
}
