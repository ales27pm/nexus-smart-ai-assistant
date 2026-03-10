import ExpoModulesCore
import Foundation

private actor CoreMLRuntimeActor {
    private let engine = CoreMLRuntimeEngine()

    func loadModel(dict: [String: Any]) async throws -> [String: Any] {
        let info = try await engine.loadModel(options: CoreMLLoadOptions(dict: dict))
        return [
            "loaded": true,
            "modelURL": info.compiledURL.path,
            "sourceModelURL": info.sourceModelURL?.path as Any,
            "computeUnits": info.computeUnits,
            "expectsSingleToken": info.expectsSingleToken,
            "hasState": info.hasState,
            "inputIdsName": info.inputIdsName,
            "attentionMaskName": info.attentionMaskName,
            "cachePositionName": info.cachePositionName,
            "logitsName": info.logitsName,
            "eosTokenId": info.eosTokenId as Any,
            "maxContext": info.maxContext as Any,
        ]
    }

    func unloadModel() async {
        await engine.unloadModel()
    }

    func isLoaded() -> Bool {
        engine.isLoaded()
    }

    func tokenize(prompt: String, tokenizerDict: [String: Any]) throws -> [Int] {
        try engine.tokenize(prompt: prompt, config: TokenizerConfig(dict: tokenizerDict))
    }

    func decode(tokenIds: [Int], tokenizerDict: [String: Any]) throws -> String {
        try engine.decode(tokenIds: tokenIds, config: TokenizerConfig(dict: tokenizerDict))
    }

    func generate(prompt: String, opts: [String: Any]) async throws -> String {
        try await engine.generate(prompt: prompt, options: CoreMLGenerateOptionsRecord(dict: opts))
    }

    func generateFromTokens(tokenIds: [Int], opts: [String: Any]) async throws -> [Int] {
        try await engine.generateFromTokens(promptTokenIds: tokenIds, options: CoreMLGenerateOptionsRecord(dict: opts, includeTokenizer: false))
    }

    func beginGenerationSession(opts: [String: Any]) async throws -> Bool {
        try await engine.beginSession(options: CoreMLSessionStartOptions(dict: opts))
    }

    func generateNextToken() async throws -> Int? {
        try await engine.generateNextToken()
    }

    func endGenerationSession() async {
        await engine.endSession()
    }

    func cancel() async {
        await engine.cancel()
    }

    func metrics() -> [String: Any] {
        engine.metricsSnapshot().asDictionary()
    }
}

public final class ExpoCoreMLLLMModule: Module {
    private let runtime = CoreMLRuntimeActor()

    public func definition() -> ModuleDefinition {
        Name("ExpoCoreMLLLMModule")

        AsyncFunction("loadModelAsync") { (opts: [String: Any]) async throws -> [String: Any] in
            do {
                return try await self.runtime.loadModel(dict: opts)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("unloadModelAsync") { () async -> Void in
            await self.runtime.unloadModel()
        }

        AsyncFunction("isLoadedAsync") { () async -> Bool in
            await self.runtime.isLoaded()
        }

        AsyncFunction("tokenizeAsync") { (prompt: String, tokenizer: [String: Any]) async throws -> [Int] in
            do {
                return try await self.runtime.tokenize(prompt: prompt, tokenizerDict: tokenizer)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("decodeAsync") { (tokenIds: [Int], tokenizer: [String: Any]) async throws -> String in
            do {
                return try await self.runtime.decode(tokenIds: tokenIds, tokenizerDict: tokenizer)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("generateAsync") { (prompt: String, opts: [String: Any]) async throws -> String in
            do {
                return try await self.runtime.generate(prompt: prompt, opts: opts)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("generateFromTokensAsync") { (tokenIds: [Int], opts: [String: Any]) async throws -> [Int] in
            do {
                return try await self.runtime.generateFromTokens(tokenIds: tokenIds, opts: opts)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("beginGenerationSessionAsync") { (opts: [String: Any]) async throws -> Bool in
            do {
                return try await self.runtime.beginGenerationSession(opts: opts)
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("generateNextTokenAsync") { () async throws -> Int? in
            do {
                return try await self.runtime.generateNextToken()
            } catch {
                throw Self.toModuleError(error)
            }
        }

        AsyncFunction("endGenerationSessionAsync") { () async -> Void in
            await self.runtime.endGenerationSession()
        }

        AsyncFunction("cancelAsync") { () async -> Void in
            await self.runtime.cancel()
        }

        AsyncFunction("getRuntimeMetricsAsync") { () async -> [String: Any] in
            await self.runtime.metrics()
        }
    }

    private static func toModuleError(_ error: Error) -> NSError {
        if let runtimeError = error as? CoreMLRuntimeError {
            return NSError(
                domain: "ExpoCoreMLLLM",
                code: runtimeError.code,
                userInfo: [NSLocalizedDescriptionKey: runtimeError.localizedDescription]
            )
        }

        if let tokenizerError = error as? CoreMLTokenizerError {
            let code: Int
            switch tokenizerError {
            case .invalidConfiguration: code = 120
            case .assetMissing: code = 12
            case .malformedVocabulary, .malformedMerges, .unknownToken: code = 121
            }
            return NSError(
                domain: "ExpoCoreMLLLM",
                code: code,
                userInfo: [NSLocalizedDescriptionKey: tokenizerError.localizedDescription]
            )
        }

        let nsError = error as NSError
        if nsError.domain == "ExpoCoreMLLLM" { return nsError }
        return NSError(
            domain: "ExpoCoreMLLLM",
            code: nsError.code,
            userInfo: [NSLocalizedDescriptionKey: nsError.localizedDescription]
        )
    }
}
