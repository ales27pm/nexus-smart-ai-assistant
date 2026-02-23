import ExpoModulesCore
import CoreML

public final class ExpoCoreMLLLMModule: Module {
  private let runner = CoreMLLLMRunner()

  public func definition() -> ModuleDefinition {
    Name("ExpoCoreMLLLMModule")

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
  }
}
