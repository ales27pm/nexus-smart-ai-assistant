import Foundation
import CoreML
import ExpoModulesCore

public final class ExpoCoreMLLLMModule: Module {
  private let runner = CoreMLLLMRunner.shared

  public func definition() -> ModuleDefinition {
    Name("ExpoCoreMLLLMModule")

    AsyncFunction("loadModelAsync") { (opts: [String: Any]) async throws -> [String: Any] in
      try runner.loadModel(options: opts)
      return runner.modelInfoDictionary()
    }

    AsyncFunction("unloadModelAsync") { () async -> Void in
      runner.unloadModel()
    }

    AsyncFunction("isLoadedAsync") { () async -> Bool in
      return runner.isLoaded
    }

    AsyncFunction("tokenizeAsync") { (prompt: String, tokenizer: [String: Any]) async throws -> [Int] in
      let tok = try GPT2BPETokenizer.fromBundle(tokenizer: tokenizer)
      return try tok.encode(prompt)
    }

    AsyncFunction("decodeAsync") { (tokenIds: [Int], tokenizer: [String: Any]) async throws -> String in
      let tok = try GPT2BPETokenizer.fromBundle(tokenizer: tokenizer)
      return tok.decode(tokenIds)
    }

    AsyncFunction("generateAsync") { (prompt: String, opts: [String: Any]) async throws -> String in
      let tokenIds: [Int]
      if let tokDict = opts["tokenizer"] as? [String: Any] {
        let tok = try GPT2BPETokenizer.fromBundle(tokenizer: tokDict)
        tokenIds = try tok.encode(prompt)
        let out = try await runner.generate(from: tokenIds, options: opts)
        return tok.decode(out)
      } else {
        throw CoreMLLLMError("generateAsync requires opts.tokenizer for native tokenization. Use generateFromTokensAsync otherwise.")
      }
    }

    AsyncFunction("generateFromTokensAsync") { (tokenIds: [Int], opts: [String: Any]) async throws -> [Int] in
      return try await runner.generate(from: tokenIds, options: opts)
    }
  }
}
