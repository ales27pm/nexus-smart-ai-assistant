import Foundation

enum ExpoCoreMLLLMBundles {
  static var moduleBundle: Bundle {
    Bundle(for: ExpoCoreMLLLMModule.self)
  }

  static var resourcesBundle: Bundle {
    if let url = moduleBundle.url(forResource: "ExpoCoreMLLLMResources", withExtension: "bundle"),
       let b = Bundle(url: url) {
      return b
    }
    return moduleBundle
  }

  static func resolveResourceURL(bundle: Bundle, path: String) -> URL? {
    let url = URL(fileURLWithPath: path)
    let subdir = url.deletingLastPathComponent().path
    let name = url.deletingPathExtension().lastPathComponent
    let ext = url.pathExtension.isEmpty ? nil : url.pathExtension

    if subdir == "/" || subdir == "." || subdir.isEmpty {
      return bundle.url(forResource: name, withExtension: ext)
    }

    let cleanSubdir = subdir.hasPrefix("/") ? String(subdir.dropFirst()) : subdir
    return bundle.url(forResource: name, withExtension: ext, subdirectory: cleanSubdir)
  }
}
