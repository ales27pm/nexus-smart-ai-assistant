import Foundation

enum ResourceResolver {
  private static let logPrefix = "[ExpoCoreMLLLM][ResourceResolver]"

  private static func log(_ message: String) {
    NSLog("%@ %@", logPrefix, message)
  }

  private static func bundleURLDescription(_ url: URL?) -> String {
    url?.path ?? "<nil>"
  }

  private static func scanMatchingBundles(in root: URL, prefix: String) -> [URL] {
    guard let e = FileManager.default.enumerator(
      at: root,
      includingPropertiesForKeys: [.isDirectoryKey],
      options: [.skipsHiddenFiles]
    ) else {
      return []
    }

    var results: [URL] = []
    for case let url as URL in e where url.pathExtension == "bundle" {
      let name = url.deletingPathExtension().lastPathComponent
      if name.hasPrefix(prefix) {
        results.append(url)
      }
    }

    return results
  }

  private static func findNamedResource(
    in bundle: Bundle,
    name: String
  ) -> URL? {
    guard let e = FileManager.default.enumerator(
      at: bundle.bundleURL,
      includingPropertiesForKeys: nil,
      options: [.skipsHiddenFiles]
    ) else {
      return nil
    }

    for case let url as URL in e where url.lastPathComponent == name {
      return url
    }

    return nil
  }

  static func resourceBundle() -> Bundle? {
    let moduleBundle = Bundle(for: ExpoCoreMLLLMModule.self)
    let mainBundle = Bundle.main
    let moduleRoot = moduleBundle.bundleURL
    let mainRoot = mainBundle.bundleURL

    log("module bundle path: \(bundleURLDescription(moduleRoot))")
    log("main bundle path: \(bundleURLDescription(mainRoot))")

    let moduleDirectURL = moduleBundle.url(forResource: "ExpoCoreMLLLMResources", withExtension: "bundle")
    let mainDirectURL = mainBundle.url(forResource: "ExpoCoreMLLLMResources", withExtension: "bundle")

    log("direct lookup module has ExpoCoreMLLLMResources.bundle: \(moduleDirectURL != nil)")
    log("direct lookup main has ExpoCoreMLLLMResources.bundle: \(mainDirectURL != nil)")

    if let url = moduleDirectURL,
       let b = Bundle(url: url) {
      log("using resource bundle from module direct lookup: \(url.path)")
      return b
    }

    if let url = mainDirectURL,
       let b = Bundle(url: url) {
      log("using resource bundle from main direct lookup: \(url.path)")
      return b
    }

    let moduleMatches = scanMatchingBundles(in: moduleRoot, prefix: "ExpoCoreMLLLMResources")
    let mainMatches = scanMatchingBundles(in: mainRoot, prefix: "ExpoCoreMLLLMResources")

    log("fallback prefix bundle scan (module): \(moduleMatches.map(\.path))")
    log("fallback prefix bundle scan (main): \(mainMatches.map(\.path))")

    for match in moduleMatches + mainMatches {
      if let b = Bundle(url: match) {
        log("using resource bundle from prefix scan: \(match.path)")
        return b
      }
    }

    log("resource bundle not found after direct lookup and prefix scan")

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
      // Fallback for resource bundles that flatten nested paths.
      if let url = b.url(forResource: name, withExtension: ext) {
        return url
      }
    } else if let url = b.url(forResource: file, withExtension: nil, subdirectory: dir.isEmpty ? nil : dir) {
      return url
    } else if let url = b.url(forResource: file, withExtension: nil) {
      return url
    }

    // Final fallback: recursive basename lookup.
    if let url = findNamedResource(in: b, name: file) {
      return url
    }

    throw NSError(domain: "ExpoCoreMLLLM", code: 12, userInfo: [
      NSLocalizedDescriptionKey: "Asset not found in resource bundle: \(path) (looked for \(cleaned))"
    ])
  }

  static func resolveModelURL(modelPath: String?) throws -> URL {
    guard let modelPath, !modelPath.isEmpty else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 20, userInfo: [
        NSLocalizedDescriptionKey: "modelPath is required"
      ])
    }

    return try resolveModuleAssetPath(modelPath)
  }
}
