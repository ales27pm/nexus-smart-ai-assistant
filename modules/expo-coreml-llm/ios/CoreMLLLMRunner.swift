import Foundation
import CoreML

final class CoreMLLLMRunner {
  private(set) var isLoaded: Bool = false

  private var model: MLModel?

  private var inputIdsName: String = "input_ids"
  private var attentionMaskName: String = "attention_mask"
  private var cachePositionName: String = "cache_position"
  private var logitsName: String = "logits"

  private var eosTokenId: Int?
  private var maxContext: Int?

  private var expectsSingleToken: Bool = false

  private var hasState: Bool = false
  @available(iOS 18.0, *)
  private var state: MLState?

  private let lock = NSLock()

  private var tokenizerCacheKey: String?
  private var tokenizerCache: Tokenizer?

  func unload() {
    lock.lock(); defer { lock.unlock() }
    model = nil
    if #available(iOS 18.0, *) { state = nil }
    isLoaded = false
    tokenizerCacheKey = nil
    tokenizerCache = nil
  }

  func load(options: Types.LoadModelOptions) throws -> Types.ModelInfo {
    let cfg = MLModelConfiguration()
    cfg.computeUnits = computeUnits(from: options.computeUnits)
    cfg.allowLowPrecisionAccumulationOnGPU = true

    let modelURL = try ResourceResolver.resolveModelURL(
      modelFile: options.modelFile ?? options.modelName,
      modelPath: options.modelPath
    )
    let loaded = try MLModel(contentsOf: modelURL, configuration: cfg)

    self.inputIdsName = options.inputIdsName
    self.attentionMaskName = options.attentionMaskName
    self.cachePositionName = options.cachePositionName
    self.logitsName = options.logitsName
    self.eosTokenId = options.eosTokenId
    self.maxContext = options.maxContext

    let inDesc = loaded.modelDescription.inputDescriptionsByName[self.inputIdsName]
    let shape = inDesc?.multiArrayConstraint?.shape.map { $0.intValue } ?? []
    self.expectsSingleToken = (shape.count == 2 && shape[1] == 1) || shape == [1, 1]

    if #available(iOS 18.0, *) {
      self.hasState = !loaded.modelDescription.stateDescriptionsByName.isEmpty
    } else {
      self.hasState = false
    }

    self.model = loaded
    self.isLoaded = true

    return Types.ModelInfo(
      loaded: true,
      modelURL: modelURL.absoluteString,
      computeUnits: options.computeUnits,
      expectsSingleToken: self.expectsSingleToken,
      hasState: self.hasState,
      inputIdsName: self.inputIdsName,
      attentionMaskName: self.attentionMaskName,
      cachePositionName: self.cachePositionName,
      logitsName: self.logitsName,
      eosTokenId: self.eosTokenId,
      maxContext: self.maxContext
    )
  }

  func getTokenizer(configDict: [String: Any]) throws -> Tokenizer {
    let cfg = try Types.TokenizerConfig(from: configDict)
    let key = "\(cfg.kind.rawValue)||\(cfg.vocabJsonAssetPath ?? "")||\(cfg.mergesTxtAssetPath ?? "")||\(cfg.bosTokenId ?? -1)||\(cfg.eosTokenId ?? -1)"
    if let k = tokenizerCacheKey, k == key, let tok = tokenizerCache { return tok }

    let tok: Tokenizer
    switch cfg.kind {
    case .none:
      throw NSError(domain: "ExpoCoreMLLLM", code: 120, userInfo: [
        NSLocalizedDescriptionKey: "tokenizer.kind=none not supported for token-mode models."
      ])
    case .gpt2_bpe:
      let vocabURL = try ResourceResolver.resolveModuleAssetPath(cfg.vocabJsonAssetPath!)
      let mergesURL = try ResourceResolver.resolveModuleAssetPath(cfg.mergesTxtAssetPath!)
      tok = try GPT2BPETokenizer(vocabURL: vocabURL, mergesURL: mergesURL, bosTokenId: cfg.bosTokenId, eosTokenId: cfg.eosTokenId)
    }

    tokenizerCacheKey = key
    tokenizerCache = tok
    return tok
  }

  func generate(prompt: String, options: Types.GenerateOptions) throws -> String {
    guard isLoaded, let m = model else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 100, userInfo: [NSLocalizedDescriptionKey: "Model not loaded. Call loadModelAsync first."])
    }
    guard let tokDict = options.tokenizer else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 101, userInfo: [NSLocalizedDescriptionKey: "This model is token-based; opts.tokenizer is required."])
    }

    let tokenizer = try getTokenizer(configDict: tokDict)
    let tokens = tokenizer.encode(prompt)

    let outTokens = try generateFromTokensInternal(
      model: m,
      initialTokens: tokens,
      maxNewTokens: options.maxNewTokens,
      temperature: options.temperature,
      topK: options.topK,
      topP: options.topP,
      repetitionPenalty: options.repetitionPenalty,
      stopTokenIds: options.stopTokenIds,
      seed: options.seed,
      maxContext: self.maxContext,
      eosTokenId: self.eosTokenId ?? tokenizer.eosTokenId
    )

    return tokenizer.decode(outTokens)
  }

  func generateFromTokens(initialTokens: [Int], options: Types.GenerateFromTokensOptions) throws -> [Int] {
    guard isLoaded, let m = model else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 100, userInfo: [NSLocalizedDescriptionKey: "Model not loaded. Call loadModelAsync first."])
    }

    return try generateFromTokensInternal(
      model: m,
      initialTokens: initialTokens,
      maxNewTokens: options.maxNewTokens,
      temperature: options.temperature,
      topK: options.topK,
      topP: options.topP,
      repetitionPenalty: options.repetitionPenalty,
      stopTokenIds: options.stopTokenIds,
      seed: options.seed,
      maxContext: options.maxContext ?? self.maxContext,
      eosTokenId: self.eosTokenId
    )
  }

  private func generateFromTokensInternal(
    model: MLModel,
    initialTokens: [Int],
    maxNewTokens: Int,
    temperature: Float,
    topK: Int,
    topP: Float,
    repetitionPenalty: Float,
    stopTokenIds: [Int],
    seed: Int?,
    maxContext: Int?,
    eosTokenId: Int?
  ) throws -> [Int] {
    var rng = SeededGenerator(seed: seed ?? Int.random(in: Int.min...Int.max))

    var tokens = initialTokens
    let stopSet = Set(stopTokenIds)

    lock.lock(); defer { lock.unlock() }

    if #available(iOS 18.0, *) {
      if hasState {
        self.state = try model.makeState()
      } else {
        self.state = nil
      }
    }

    if expectsSingleToken {
      var pos = 0
      var lastLogits: [Float]? = nil
      for t in tokens {
        lastLogits = try predictSingleToken(model: model, tokenId: t, position: pos)
        pos += 1
      }

      guard var logits = lastLogits else {
        throw NSError(domain: "ExpoCoreMLLLM", code: 140, userInfo: [
          NSLocalizedDescriptionKey: "Empty prompt tokens. Provide at least one token to start generation."
        ])
      }

      for _ in 0..<maxNewTokens {
        let ctx: [Int]
        if let mc = maxContext, mc > 0, tokens.count > mc {
          ctx = Array(tokens.suffix(mc))
        } else {
          ctx = tokens
        }

        var logitsMutable = logits
        Sampling.applyRepetitionPenalty(&logitsMutable, tokenIds: ctx, penalty: repetitionPenalty)

        var probs = Sampling.softmax(logitsMutable, temperature: temperature)
        if topK > 0 { Sampling.topKFilter(&probs, k: topK) }
        if topP < 1.0 { Sampling.topPFilter(&probs, p: topP) }

        let next = Sampling.sample(probs: probs, rng: &rng)
        tokens.append(next)

        if stopSet.contains(next) { break }
        if let eos = eosTokenId, next == eos { break }

        logits = try predictSingleToken(model: model, tokenId: next, position: pos)
        pos += 1
      }

      return tokens
    }

    throw NSError(domain: "ExpoCoreMLLLM", code: 141, userInfo: [
      NSLocalizedDescriptionKey: "This runner currently expects single-token models (input_ids shape [1,1])."
    ])
  }

  private func predictSingleToken(model: MLModel, tokenId: Int, position: Int) throws -> [Float] {
    let inputIds = try makeInt32MultiArray2D(value: tokenId)
    let attnMask = try makeInt32MultiArray2D(value: 1)
    let cachePos = try makeInt32MultiArray1D(value: position)

    let features: [String: Any] = [
      inputIdsName: inputIds,
      attentionMaskName: attnMask,
      cachePositionName: cachePos,
    ]

    let provider = try MLDictionaryFeatureProvider(dictionary: features.mapValues { $0 as Any })
    let opts = MLPredictionOptions()

    let out: MLFeatureProvider
    if #available(iOS 18.0, *), hasState, let st = state {
      out = try model.prediction(from: provider, using: st, options: opts)
    } else {
      out = try model.prediction(from: provider, options: opts)
    }

    guard let mv = out.featureValue(for: logitsName)?.multiArrayValue else {
      for n in out.featureNames {
        if let mm = out.featureValue(for: n)?.multiArrayValue {
          return try extractLogits(mm)
        }
      }
      throw NSError(domain: "ExpoCoreMLLLM", code: 200, userInfo: [
        NSLocalizedDescriptionKey: "No MLMultiArray logits found. Available outputs: \(Array(out.featureNames))"
      ])
    }

    return try extractLogits(mv)
  }

  private func extractLogits(_ logits: MLMultiArray) throws -> [Float] {
    let shape = logits.shape.map { $0.intValue }

    func f(_ idx: [NSNumber]) -> Float { Float(truncating: logits[idx]) }

    if shape.count == 3 {
      let s = shape[1]
      let v = shape[2]
      let last = max(0, s - 1)
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { out[j] = f([0, NSNumber(value: last), NSNumber(value: j)]) }
      return out
    }

    if shape.count == 2 {
      let s = shape[0]
      let v = shape[1]
      let row = max(0, s - 1)
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { out[j] = f([NSNumber(value: row), NSNumber(value: j)]) }
      return out
    }

    if shape.count == 1 {
      let v = shape[0]
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { out[j] = Float(truncating: logits[NSNumber(value: j)]) }
      return out
    }

    let c = logits.count
    var out = [Float](repeating: 0, count: c)
    for i in 0..<c { out[i] = logits[i].floatValue }
    return out
  }

  private func makeInt32MultiArray2D(value: Int) throws -> MLMultiArray {
    let arr = try MLMultiArray(shape: [1, 1], dataType: .int32)
    arr[[0, 0]] = NSNumber(value: Int32(value))
    return arr
  }

  private func makeInt32MultiArray1D(value: Int) throws -> MLMultiArray {
    let arr = try MLMultiArray(shape: [1], dataType: .int32)
    arr[0] = NSNumber(value: Int32(value))
    return arr
  }

  private func computeUnits(from cu: Types.CoreMLComputeUnits) -> MLComputeUnits {
    switch cu {
    case .all: return .all
    case .cpuOnly: return .cpuOnly
    case .cpuAndGPU: return .cpuAndGPU
    case .cpuAndNeuralEngine: return .cpuAndNeuralEngine
    }
  }
}
