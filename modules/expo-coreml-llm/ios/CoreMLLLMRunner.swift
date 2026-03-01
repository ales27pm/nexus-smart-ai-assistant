import Foundation
import CoreML

final class CoreMLLLMRunner {
  private(set) var isLoaded: Bool = false

  private var model: MLModel?

  private var inputIdsName: String = "input_ids"
  private var attentionMaskName: String = "attention_mask"
  private var cachePositionName: String = "cache_position"
  private var logitsName: String = "logits"

  private var inputIdsRank: Int = 2
  private var attentionMaskRank: Int = 2
  private var cachePositionRank: Int = 1

  private var eosTokenId: Int?
  private var maxContext: Int?

  private var expectsSingleToken: Bool = false
  private var hasState: Bool = false

  private let lock = NSLock()
  private var isCancelled: Bool = false

  private var tokenizerCacheKey: String?
  private var tokenizerCache: Tokenizer?

  func unload() {
    lock.lock(); defer { lock.unlock() }
    isCancelled = true
    model = nil
    isLoaded = false
    expectsSingleToken = false
    hasState = false
    inputIdsRank = 2
    attentionMaskRank = 2
    cachePositionRank = 1
    tokenizerCacheKey = nil
    tokenizerCache = nil
  }

  func cancelGeneration() {
    lock.lock(); defer { lock.unlock() }
    isCancelled = true
  }

  func load(options: Types.LoadModelOptions) throws -> Types.ModelInfo {
    let modelURL: URL
    do {
      modelURL = try ResourceResolver.resolveModelURL(
        modelFile: options.modelFile ?? options.modelName,
        modelPath: options.modelPath
      )
    } catch {
      throw NSError(domain: "ExpoCoreMLLLM", code: Types.LLMError.modelMissing.rawValue, userInfo: [
        NSLocalizedDescriptionKey: "Missing CoreML model resource. Verify bundled .mlpackage exists.",
        NSUnderlyingErrorKey: error,
      ])
    }

    let attempts = computeUnitFallbacks(preferred: options.computeUnits)
    var loaded: MLModel?
    var loadedComputeUnits: Types.CoreMLComputeUnits?
    var firstFailure: Error?
    var failureSummaries = [String]()

    for unit in attempts {
      do {
        let cfg = MLModelConfiguration()
        cfg.computeUnits = computeUnits(from: unit)
        cfg.allowLowPrecisionAccumulationOnGPU = true

        loaded = try MLModel(contentsOf: modelURL, configuration: cfg)
        loadedComputeUnits = unit
        break
      } catch {
        if firstFailure == nil { firstFailure = error }

        let nsError = error as NSError
        failureSummaries.append("\(unit.rawValue): \(nsError.domain)(\(nsError.code))")

        if isOutOfMemoryError(error) {
          throw NSError(domain: "ExpoCoreMLLLM", code: Types.LLMError.outOfMemory.rawValue, userInfo: [
            NSLocalizedDescriptionKey: "Unable to allocate memory for CoreML model.",
            NSUnderlyingErrorKey: error,
          ])
        }

        let isPlanBuildFailure = isModelPlanBuildError(error)
        if isPlanBuildFailure && unit == .cpuOnly {
          throw NSError(domain: "ExpoCoreMLLLM", code: 104, userInfo: [
            NSLocalizedDescriptionKey: "CoreML could not build an execution plan for this model on this device.",
            NSUnderlyingErrorKey: error,
          ])
        }

        let isRetryable = isPlanBuildFailure && unit != .cpuOnly
        if isRetryable {
          continue
        }

        throw error
      }
    }

    guard let loaded else {
      let details = failureSummaries.joined(separator: ", ")
      var info: [String: Any] = [
        NSLocalizedDescriptionKey: "Failed to load CoreML model for all compute-unit fallbacks: \(details)",
      ]
      if let firstFailure {
        info[NSUnderlyingErrorKey] = firstFailure
      }
      throw NSError(domain: "ExpoCoreMLLLM", code: 104, userInfo: info)
    }

    let inDesc = loaded.modelDescription.inputDescriptionsByName[options.inputIdsName]
    let shape = inDesc?.multiArrayConstraint?.shape.map { $0.intValue } ?? []
    let detectedSingleToken = (shape.count == 2 && shape[1] == 1) || shape == [1, 1]

    let maskDesc = loaded.modelDescription.inputDescriptionsByName[options.attentionMaskName]
    let cacheDesc = loaded.modelDescription.inputDescriptionsByName[options.cachePositionName]
    let detectedInputIdsRank = shape.count > 0 ? shape.count : 2
    let detectedAttentionMaskRank = maskDesc?.multiArrayConstraint?.shape.count ?? 2
    let detectedCachePositionRank = cacheDesc?.multiArrayConstraint?.shape.count ?? 1

    let detectedHasState: Bool
    if #available(iOS 18.0, *) {
      detectedHasState = !loaded.modelDescription.stateDescriptionsByName.isEmpty
    } else {
      detectedHasState = false
    }

    lock.lock()
    self.inputIdsName = options.inputIdsName
    self.attentionMaskName = options.attentionMaskName
    self.cachePositionName = options.cachePositionName
    self.logitsName = options.logitsName
    self.inputIdsRank = detectedInputIdsRank
    self.attentionMaskRank = detectedAttentionMaskRank
    self.cachePositionRank = detectedCachePositionRank
    self.eosTokenId = options.eosTokenId
    self.maxContext = options.maxContext
    self.expectsSingleToken = detectedSingleToken
    self.hasState = detectedHasState
    self.model = loaded
    self.isLoaded = true
    self.isCancelled = false
    lock.unlock()

    return Types.ModelInfo(
      loaded: true,
      modelURL: modelURL.absoluteString,
      computeUnits: loadedComputeUnits ?? options.computeUnits,
      expectsSingleToken: detectedSingleToken,
      hasState: detectedHasState,
      inputIdsName: options.inputIdsName,
      attentionMaskName: options.attentionMaskName,
      cachePositionName: options.cachePositionName,
      logitsName: options.logitsName,
      eosTokenId: options.eosTokenId,
      maxContext: options.maxContext
    )
  }

  func getTokenizer(configDict: [String: Any]) throws -> Tokenizer {
    let cfg = try Types.TokenizerConfig(from: configDict)
    let key = "\(cfg.kind.rawValue)||\(cfg.vocabJsonAssetPath ?? "")||\(cfg.mergesTxtAssetPath ?? "")||\(cfg.bosTokenId ?? -1)||\(cfg.eosTokenId ?? -1)"

    lock.lock()
    if let k = tokenizerCacheKey, k == key, let tok = tokenizerCache {
      lock.unlock()
      return tok
    }
    lock.unlock()

    let tok: Tokenizer
    switch cfg.kind {
    case .none:
      throw NSError(domain: "ExpoCoreMLLLM", code: 120, userInfo: [
        NSLocalizedDescriptionKey: "tokenizer.kind=none not supported for token-mode models."
      ])
    case .gpt2_bpe, .byte_level_bpe:
      guard let vocabPath = cfg.vocabJsonAssetPath,
            let mergesPath = cfg.mergesTxtAssetPath else {
        throw NSError(domain: "ExpoCoreMLLLM", code: 121, userInfo: [
          NSLocalizedDescriptionKey: "Missing byte-level BPE asset path: vocabJsonAssetPath/mergesTxtAssetPath"
        ])
      }
      let vocabURL = try ResourceResolver.resolveModuleAssetPath(vocabPath)
      let mergesURL = try ResourceResolver.resolveModuleAssetPath(mergesPath)
      tok = try GPT2BPETokenizer(vocabURL: vocabURL, mergesURL: mergesURL, bosTokenId: cfg.bosTokenId, eosTokenId: cfg.eosTokenId)
    }

    lock.lock()
    tokenizerCacheKey = key
    tokenizerCache = tok
    lock.unlock()

    return tok
  }

  func generate(prompt: String, options: Types.GenerateOptions) throws -> String {
    guard isLoaded, let m = model else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 100, userInfo: [NSLocalizedDescriptionKey: "Model not loaded. Call loadModelAsync first."])
    }
    guard let tokDict = options.tokenizer else {
      throw NSError(domain: "ExpoCoreMLLLM", code: Types.LLMError.tokenBasedModelMissingTokenizer.rawValue, userInfo: [NSLocalizedDescriptionKey: "This model is token-based; opts.tokenizer is required."])
    }

    let tokenizer = try getTokenizer(configDict: tokDict)
    let tokens = tokenizer.encode(prompt)

    lock.lock()
    let localMaxContext = maxContext
    let localEos = eosTokenId
    lock.unlock()

    let outTokens = try generateFromTokensInternal(
      model: m,
      initialTokens: tokens,
      sampling: options.sampling,
      maxContext: localMaxContext,
      eosTokenId: localEos ?? tokenizer.eosTokenId
    )

    return tokenizer.decode(outTokens)
  }

  func generateFromTokens(initialTokens: [Int], options: Types.GenerateFromTokensOptions) throws -> [Int] {
    guard isLoaded, let m = model else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 100, userInfo: [NSLocalizedDescriptionKey: "Model not loaded. Call loadModelAsync first."])
    }

    lock.lock()
    let localMaxContext = maxContext
    let localEos = eosTokenId
    lock.unlock()

    return try generateFromTokensInternal(
      model: m,
      initialTokens: initialTokens,
      sampling: options.sampling,
      maxContext: options.maxContext ?? localMaxContext,
      eosTokenId: localEos
    )
  }

  private func generateFromTokensInternal(
    model: MLModel,
    initialTokens: [Int],
    sampling: Types.SamplingOptions,
    maxContext: Int?,
    eosTokenId: Int?
  ) throws -> [Int] {
    lock.lock()
    isCancelled = false
    lock.unlock()

    var rng = SeededGenerator(seed: sampling.seed ?? Int.random(in: Int.min...Int.max))

    var tokens = initialTokens
    let stopSet = Set(sampling.stopTokenIds)

    lock.lock()
    let localHasState = hasState
    let localSingleToken = expectsSingleToken
    lock.unlock()

    var localState: MLState?
    if #available(iOS 18.0, *), localHasState {
      localState = model.makeState()
    }

    if localSingleToken {
      var pos = 0
      var lastLogits: [Float]? = nil
      for t in tokens {
        if shouldCancelGeneration() {
          throw NSError(domain: "ExpoCoreMLLLM", code: 103, userInfo: [
            NSLocalizedDescriptionKey: "Generation cancelled"
          ])
        }
        let cachePosition = clampCachePosition(pos, maxContext: maxContext)
        lastLogits = try predictSingleToken(
          model: model,
          tokenId: t,
          position: cachePosition,
          state: localState
        )
        pos += 1
      }

      guard var logits = lastLogits else {
        throw NSError(domain: "ExpoCoreMLLLM", code: 140, userInfo: [
          NSLocalizedDescriptionKey: "Empty prompt tokens. Provide at least one token to start generation."
        ])
      }

      for _ in 0..<sampling.maxNewTokens {
        if shouldCancelGeneration() {
          throw NSError(domain: "ExpoCoreMLLLM", code: 103, userInfo: [
            NSLocalizedDescriptionKey: "Generation cancelled"
          ])
        }
        let ctx: [Int]
        if let mc = maxContext, mc > 0, tokens.count > mc {
          ctx = Array(tokens.suffix(mc))
        } else {
          ctx = tokens
        }

        var logitsMutable = logits
        Sampling.applyRepetitionPenalty(&logitsMutable, tokenIds: ctx, penalty: sampling.repetitionPenalty)

        var probs = Sampling.softmax(logitsMutable, temperature: sampling.temperature)
        if sampling.topK > 0 { Sampling.topKFilter(&probs, k: sampling.topK) }
        if sampling.topP < 1.0 { Sampling.topPFilter(&probs, p: sampling.topP) }

        let next = Sampling.sample(probs: probs, rng: &rng)
        tokens.append(next)

        if stopSet.contains(next) { break }
        if let eos = eosTokenId, next == eos { break }

        let cachePosition = clampCachePosition(pos, maxContext: maxContext)
        logits = try predictSingleToken(
          model: model,
          tokenId: next,
          position: cachePosition,
          state: localState
        )
        pos += 1
      }

      return tokens
    }

    let prefillTokens: [Int]
    if let mc = maxContext, mc > 0, tokens.count > mc {
      prefillTokens = Array(tokens.suffix(mc))
    } else {
      prefillTokens = tokens
    }
    _ = prefillTokens

    let batchTokens: [Int]
    if let mc = maxContext, mc > 0, tokens.count > mc {
      batchTokens = Array(tokens.suffix(mc))
    } else {
      batchTokens = tokens
    }
    var logits = try predictTokenBatch(
      model: model,
      tokenIds: batchTokens,
      startPosition: 0,
      state: localState,
      maxContext: maxContext
    )

    for _ in 0..<sampling.maxNewTokens {
      if shouldCancelGeneration() {
        throw NSError(domain: "ExpoCoreMLLLM", code: 103, userInfo: [
          NSLocalizedDescriptionKey: "Generation cancelled"
        ])
      }
      let ctx: [Int]
      if let mc = maxContext, mc > 0, tokens.count > mc {
        ctx = Array(tokens.suffix(mc))
      } else {
        ctx = tokens
      }

      var logitsMutable = logits
      Sampling.applyRepetitionPenalty(&logitsMutable, tokenIds: ctx, penalty: sampling.repetitionPenalty)

      var probs = Sampling.softmax(logitsMutable, temperature: sampling.temperature)
      if sampling.topK > 0 { Sampling.topKFilter(&probs, k: sampling.topK) }
      if sampling.topP < 1.0 { Sampling.topPFilter(&probs, p: sampling.topP) }

      let next = Sampling.sample(probs: probs, rng: &rng)
      tokens.append(next)
      if stopSet.contains(next) { break }
      if let eos = eosTokenId, next == eos { break }

      logits = try predictTokenBatch(
        model: model,
        tokenIds: [next],
        startPosition: tokens.count - 1,
        state: localState,
        maxContext: maxContext
      )
    }

    return tokens
  }


  private func predictTokenBatch(
    model: MLModel,
    tokenIds: [Int],
    startPosition: Int,
    state: MLState?,
    maxContext: Int?
  ) throws -> [Float] {
    if tokenIds.isEmpty {
      throw NSError(domain: "ExpoCoreMLLLM", code: 142, userInfo: [
        NSLocalizedDescriptionKey: "Token batch cannot be empty."
      ])
    }

    if tokenIds.count == 1 {
      let cachePosition = clampCachePosition(startPosition, maxContext: maxContext)
      return try predictSingleToken(
        model: model,
        tokenId: tokenIds[0],
        position: cachePosition,
        state: state
      )
    }

    lock.lock()
    let localInputIdsRank = inputIdsRank
    let localAttentionMaskRank = attentionMaskRank
    let localCachePositionRank = cachePositionRank
    lock.unlock()

    let inputIds = try makeInt32MultiArray(values: tokenIds, rank: localInputIdsRank)
    let attnMask = try makeInt32MultiArray(
      values: Array(repeating: 1, count: tokenIds.count),
      rank: localAttentionMaskRank
    )
    let cachePos = try makeInt32MultiArray(values: (0..<tokenIds.count).map {
      clampCachePosition(startPosition + $0, maxContext: maxContext)
    }, rank: localCachePositionRank)

    lock.lock()
    let inputName = inputIdsName
    let maskName = attentionMaskName
    let cacheName = cachePositionName
    let outName = logitsName
    lock.unlock()

    let provider = try MLDictionaryFeatureProvider(dictionary: [
      inputName: inputIds,
      maskName: attnMask,
      cacheName: cachePos,
    ])

    let opts = MLPredictionOptions()
    let out: MLFeatureProvider
    if #available(iOS 18.0, *), let st = state {
      out = try model.prediction(from: provider, using: st, options: opts)
    } else {
      out = try model.prediction(from: provider, options: opts)
    }

    guard let mv = firstLogitsMultiArray(from: out, preferredOutputName: outName) else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 200, userInfo: [
        NSLocalizedDescriptionKey: "No MLMultiArray logits found. Available outputs: \(Array(out.featureNames))"
      ])
    }

    return try extractLogits(mv)
  }

  private func clampCachePosition(_ position: Int, maxContext: Int?) -> Int {
    if let mc = maxContext, mc > 0 {
      return min(position, mc - 1)
    }
    return position
  }

  private func predictSingleToken(
    model: MLModel,
    tokenId: Int,
    position: Int,
    state: MLState?
  ) throws -> [Float] {
    lock.lock()
    let localInputIdsRank = inputIdsRank
    let localAttentionMaskRank = attentionMaskRank
    let localCachePositionRank = cachePositionRank
    lock.unlock()

    let inputIds = try makeInt32MultiArray(values: [tokenId], rank: localInputIdsRank)
    let attnMask = try makeInt32MultiArray(values: [1], rank: localAttentionMaskRank)
    let cachePos = try makeInt32MultiArray(values: [position], rank: localCachePositionRank)

    lock.lock()
    let inputName = inputIdsName
    let maskName = attentionMaskName
    let cacheName = cachePositionName
    let outName = logitsName
    lock.unlock()

    let features: [String: Any] = [
      inputName: inputIds,
      maskName: attnMask,
      cacheName: cachePos,
    ]

    let provider = try MLDictionaryFeatureProvider(dictionary: features.mapValues { $0 as Any })
    let opts = MLPredictionOptions()

    let out: MLFeatureProvider
    if #available(iOS 18.0, *), let st = state {
      out = try model.prediction(from: provider, using: st, options: opts)
    } else {
      out = try model.prediction(from: provider, options: opts)
    }

    guard let mv = firstLogitsMultiArray(from: out, preferredOutputName: outName) else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 200, userInfo: [
        NSLocalizedDescriptionKey: "No MLMultiArray logits found. Available outputs: \(Array(out.featureNames))"
      ])
    }

    return try extractLogits(mv)
  }


  private func firstLogitsMultiArray(
    from output: MLFeatureProvider,
    preferredOutputName: String
  ) -> MLMultiArray? {
    if let preferred = output.featureValue(for: preferredOutputName)?.multiArrayValue {
      return preferred
    }

    let sortedNames = output.featureNames.sorted()
    for name in sortedNames {
      if let mm = output.featureValue(for: name)?.multiArrayValue {
        return mm
      }
    }

    return nil
  }

  private func extractLogits(_ logits: MLMultiArray) throws -> [Float] {
    let shape = logits.shape.map { $0.intValue }

    if shape.count == 3 {
      let s = shape[1]
      let v = shape[2]
      let last = max(0, s - 1)
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { 
        out[j] = Float(truncating: logits[[NSNumber(value: 0), NSNumber(value: last), NSNumber(value: j)]])
      }
      return out
    }

    if shape.count == 2 {
      let s = shape[0]
      let v = shape[1]
      let row = max(0, s - 1)
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { 
        out[j] = Float(truncating: logits[[NSNumber(value: row), NSNumber(value: j)]])
      }
      return out
    }

    if shape.count == 1 {
      let v = shape[0]
      var out = [Float](repeating: 0, count: v)
      for j in 0..<v { out[j] = Float(truncating: logits[[NSNumber(value: j)]]) }
      return out
    }

    let c = logits.count
    var out = [Float](repeating: 0, count: c)
    for i in 0..<c { out[i] = logits[i].floatValue }
    return out
  }


  private func safeInt32(_ value: Int) -> Int32 {
    let clamped = min(max(Int64(value), Int64(Int32.min)), Int64(Int32.max))
    return Int32(clamped)
  }

  private func makeInt32MultiArray(values: [Int], rank: Int) throws -> MLMultiArray {
    if rank <= 1 {
      let arr = try MLMultiArray(shape: [NSNumber(value: values.count)], dataType: .int32)
      for (idx, value) in values.enumerated() {
        arr[[NSNumber(value: idx)]] = NSNumber(value: safeInt32(value))
      }
      return arr
    }

    let arr = try MLMultiArray(shape: [1, NSNumber(value: values.count)], dataType: .int32)
    for (idx, value) in values.enumerated() {
      arr[[NSNumber(value: 0), NSNumber(value: idx)]] = NSNumber(value: safeInt32(value))
    }
    return arr
  }

  @available(iOS 16.0, *)
  private func computeUnits(from cu: Types.CoreMLComputeUnits) -> MLComputeUnits {
    switch cu {
    case .all: return .all
    case .cpuOnly: return .cpuOnly
    case .cpuAndGPU: return .cpuAndGPU
    case .cpuAndNeuralEngine: return .cpuAndNeuralEngine
    }
  }

  private func computeUnitFallbacks(preferred: Types.CoreMLComputeUnits) -> [Types.CoreMLComputeUnits] {
    var units = [preferred]
    let fallbackOrder: [Types.CoreMLComputeUnits] = [.all, .cpuAndNeuralEngine, .cpuAndGPU, .cpuOnly]
    for candidate in fallbackOrder where !units.contains(candidate) {
      units.append(candidate)
    }
    return units
  }

  private func isOutOfMemoryError(_ error: Error) -> Bool {
    let nsError = error as NSError
    let memoryDomains = Set(["MLModelErrorDomain", "MPSKernelErrorDomain", "MTLCommandBufferErrorDomain"])
    let knownMemoryCodes = Set([3, 8, 9, 10, 11, 12])

    let domainLooksMemory = memoryDomains.contains(nsError.domain)
    let codeLooksMemory = knownMemoryCodes.contains(nsError.code)
    let message = String(describing: error).lowercased()
    let messageLooksMemory = message.contains("memory") || message.contains("allocate")
    return (domainLooksMemory && codeLooksMemory) || messageLooksMemory
  }

  private func isModelPlanBuildError(_ error: Error) -> Bool {
    let nsError = error as NSError
    let message = String(describing: error).lowercased()
    if nsError.code == -4 { return true }
    return message.contains("execution plan")
      || message.contains("model architecture file")
      || message.contains("model.mil")
      || message.contains("model plan")
  }

  private func shouldCancelGeneration() -> Bool {
    lock.lock()
    let value = isCancelled
    lock.unlock()
    return value
  }
}
