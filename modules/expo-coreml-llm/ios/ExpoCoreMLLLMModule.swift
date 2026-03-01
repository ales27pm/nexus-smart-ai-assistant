import ExpoModulesCore
import CoreML

// Ensure the class is visible to the Objective-C runtime so ExpoModulesCore can
// discover and register it during autolinking/initialization. Without this
// annotation the Swift type may be stripped, preventing the module from being
// instantiated (hence the runtime error in JS).
// Make this class inherit from NSObject and implement `AnyModule` directly
// instead of relying on the `Module` typealias. `Module` is merely a
// composition of `AnyModule` and `BaseModule`, where `BaseModule` is a pure
// Swift class, which means our original subclass wasn't visible to the Objective-\
// C runtime. The registry within ExpoModulesCore scans the Objective-C runtime
// for classes conforming to `AnyModule`, so we must expose an Objective-C class
// in order for autolinking to actually register the module. Additionally,
// because the static library is linked with dead‑code stripping enabled, there
// must be at least one reference to the class from the app binary; exposing it
// via NSObject guarantees the runtime knows about it and prevents the linker
// from throwing it away.

@objc(ExpoCoreMLLLMModule)
public final class ExpoCoreMLLLMModule: NSObject, AnyModule {
  // replicate BaseModule functionality
  public private(set) weak var appContext: AppContext?

  // we also need the runner instance
  private let runner = CoreMLLLMRunner()

  // MARK: - AnyModule requirements

  public required init(appContext: AppContext) {
    self.appContext = appContext
    super.init()
  }

  @ModuleDefinitionBuilder
  public func definition() -> ModuleDefinition {
    Name("ExpoCoreMLLLMModule")

    OnCreate {
      NSLog("[ExpoCoreMLLLM][Native] ExpoCoreMLLLMModule onCreate called")
    }

    AsyncFunction("loadModelAsync") { (opts: [String: Any]) async throws -> [String: Any] in
      let options = try Types.LoadModelOptions(from: opts)
      let info = try runner.load(options: options)
      return info.toDict()
    }

    AsyncFunction("unloadModelAsync") { () async throws -> Void in
      runner.unload()
    }

    AsyncFunction("isLoadedAsync") { () async throws -> Bool in
      return runner.isLoaded
    }

    AsyncFunction("tokenizeAsync") { (prompt: String, tok: [String: Any]) async throws -> [Int] in
      let tokenizer = try runner.getTokenizer(configDict: tok)
      return tokenizer.encode(prompt)
    }

    AsyncFunction("decodeAsync") { (tokenIds: [Int], tok: [String: Any]) async throws -> String in
      let tokenizer = try runner.getTokenizer(configDict: tok)
      return tokenizer.decode(tokenIds)
    }

    AsyncFunction("generateAsync") { (prompt: String, opts: [String: Any]) async throws -> String in
      let gopts = try Types.GenerateOptions(from: opts)
      return try runner.generate(prompt: prompt, options: gopts)
    }

    AsyncFunction("generateFromTokensAsync") { (tokenIds: [Int], opts: [String: Any]) async throws -> [Int] in
      let gopts = try Types.GenerateFromTokensOptions(from: opts)
      return try runner.generateFromTokens(initialTokens: tokenIds, options: gopts)
    }

    AsyncFunction("cancelAsync") { () async throws -> Void in
      runner.cancelGeneration()
    }
  }

  // provide a convenience similar to BaseModule
  public func sendEvent(_ eventName: String, _ body: [String: Any?] = [:]) {
    appContext?.eventEmitter?.sendEvent(withName: eventName, body: body)
  }
}
