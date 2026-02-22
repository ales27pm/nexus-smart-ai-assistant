import Foundation
import CoreML

public final class CoreMLLLMRunner {
  public static let shared = CoreMLLLMRunner()

  public private(set) var isLoaded: Bool = false

  private var model: MLModel?
  private var inputIdsName: String = "input_ids"
  private var attentionMaskName: String? = "attention_mask"
  private var logitsName: String = "logits"
  private var eosTokenId: Int? = nil
  private var computeUnits: String = "all"

  private let rng = SeededRNG()
  private let generationLock = NSLock()

  private init() {}

  public func loadModel(options: [String: Any]) throws {
    generationLock.lock()
    defer { generationLock.unlock() }

    let compute = (options["computeUnits"] as? String) ?? "all"
    self.computeUnits = compute

    let config = MLModelConfiguration()
    config.computeUnits = Self.parseComputeUnits(compute)

    self.inputIdsName = (options["inputIdsName"] as? String) ?? "input_ids"
    self.attentionMaskName = (options["attentionMaskName"] as? String) ?? "attention_mask"
    self.logitsName = (options["logitsName"] as? String) ?? "logits"
    self.eosTokenId = options["eosTokenId"] as? Int

    if let modelName = options["modelName"] as? String, !modelName.isEmpty {
      if let url = Self.resolveBundleModelURL(modelName: modelName, ext: "mlmodelc") {
        self.model = try MLModel(contentsOf: url, configuration: config)
        self.isLoaded = true
        return
      }

      if let url = Self.resolveBundleModelURL(modelName: modelName, ext: "mlpackage") {
        self.model = try MLModel(contentsOf: url, configuration: config)
        self.isLoaded = true
        return
      }

      throw CoreMLLLMError("Model not found in bundle(s): \(modelName).(mlmodelc|mlpackage)")
    }

    if let modelPath = options["modelPath"] as? String, !modelPath.isEmpty {
      let url = URL(fileURLWithPath: modelPath)
      self.model = try MLModel(contentsOf: url, configuration: config)
      self.isLoaded = true
      return
    }

    throw CoreMLLLMError("loadModel requires either modelName (in bundle) or modelPath (absolute path to .mlmodelc)")
  }

  public func unloadModel() {
    generationLock.lock()
    defer { generationLock.unlock() }

    self.model = nil
    self.isLoaded = false
  }

  public func modelInfoDictionary() -> [String: Any] {
    return [
      "loaded": isLoaded,
      "inputIdsName": inputIdsName,
      "attentionMaskName": attentionMaskName as Any,
      "logitsName": logitsName,
      "eosTokenId": eosTokenId as Any,
      "computeUnits": computeUnits,
    ]
  }

  public func generate(from inputTokenIds: [Int], options: [String: Any]) async throws -> [Int] {
    guard !inputTokenIds.isEmpty else {
      throw CoreMLLLMError("generate requires at least one input token")
    }

    return try await Task.detached(priority: .userInitiated) { [weak self] in
      guard let self else { throw CoreMLLLMError("Runner deallocated") }

      self.generationLock.lock()
      defer { self.generationLock.unlock() }

      guard let model = self.model else { throw CoreMLLLMError("Model not loaded") }

      let maxNewTokens = (options["maxNewTokens"] as? Int) ?? 128
      let temperature = max(0.0, (options["temperature"] as? Double) ?? 0.8)
      let topK = max(0, (options["topK"] as? Int) ?? 40)
      let topP = min(1.0, max(0.0, (options["topP"] as? Double) ?? 0.95))
      let repetitionPenalty = max(1.0, (options["repetitionPenalty"] as? Double) ?? 1.05)
      let stopTokenIds = options["stopTokenIds"] as? [Int] ?? []

      if let seed = options["seed"] as? Int {
        self.rng.seed(UInt64(bitPattern: Int64(seed)))
      } else {
        self.rng.seedRandom()
      }

      let maxContext = (options["maxContext"] as? Int)

      var tokens = inputTokenIds

      for _ in 0..<maxNewTokens {
        let ctx = Self.cropContext(tokens, maxContext: maxContext)
        guard !ctx.isEmpty else {
          throw CoreMLLLMError("generate requires non-empty context")
        }

        let input = try self.makeInputProvider(
          inputIds: ctx,
          attentionMask: self.attentionMaskName != nil ? Array(repeating: 1, count: ctx.count) : nil
        )
        let out = try model.prediction(from: input)

        guard let logits = out.featureValue(for: self.logitsName)?.multiArrayValue else {
          throw CoreMLLLMError("Model output missing logits: \(self.logitsName)")
        }

        let next = try self.sampleNextToken(
          logits: logits,
          position: ctx.count - 1,
          temperature: temperature,
          topK: topK,
          topP: topP,
          repetitionPenalty: repetitionPenalty,
          recentTokens: ctx
        )
        tokens.append(next)

        if let eos = self.eosTokenId, next == eos { break }
        if stopTokenIds.contains(next) { break }
      }

      return tokens
    }.value
  }

  private static func cropContext(_ tokens: [Int], maxContext: Int?) -> [Int] {
    guard let maxContext, maxContext > 0, tokens.count > maxContext else { return tokens }
    return Array(tokens.suffix(maxContext))
  }

  private func makeInputProvider(inputIds: [Int], attentionMask: [Int]?) throws -> MLFeatureProvider {
    var dict: [String: MLFeatureValue] = [:]

    dict[inputIdsName] = try Self.int32MultiArrayFeature([inputIds])

    if let maskName = attentionMaskName, let attentionMask {
      dict[maskName] = try Self.int32MultiArrayFeature([attentionMask])
    }

    return try MLDictionaryFeatureProvider(dictionary: dict)
  }

  private func sampleNextToken(logits: MLMultiArray, position: Int, temperature: Double, topK: Int, topP: Double, repetitionPenalty: Double, recentTokens: [Int]) throws -> Int {
    let shape = logits.shape.map { $0.intValue }
    let ndim = shape.count

    let vocabSize: Int
    if ndim == 3 {
      vocabSize = shape[2]
    } else if ndim == 2 {
      vocabSize = shape[1]
    } else if ndim == 1 {
      vocabSize = shape[0]
    } else {
      throw CoreMLLLMError("Unsupported logits rank: \(shape)")
    }

    var scores = [Double](repeating: 0.0, count: vocabSize)

    for v in 0..<vocabSize {
      let idx: [NSNumber]
      if ndim == 3 {
        idx = [0, NSNumber(value: position), NSNumber(value: v)]
      } else if ndim == 2 {
        idx = [NSNumber(value: position), NSNumber(value: v)]
      } else {
        idx = [NSNumber(value: v)]
      }
      let raw = logits[idx].doubleValue
      scores[v] = raw
    }

    if repetitionPenalty > 1.0 {
      let recentSet = Set(recentTokens.suffix(256))
      for t in recentSet where t >= 0 && t < vocabSize {
        scores[t] /= repetitionPenalty
      }
    }

    if temperature > 0 {
      for i in 0..<scores.count {
        scores[i] /= temperature
      }
    }

    if temperature == 0 {
      var best = 0
      var bestVal = scores[0]
      for i in 1..<scores.count {
        if scores[i] > bestVal {
          bestVal = scores[i]
          best = i
        }
      }
      return best
    }

    return try Sampling.sample(logits: scores, topK: topK, topP: topP, rng: rng)
  }

  private static func int32MultiArrayFeature(_ arrays: [[Int]]) throws -> MLFeatureValue {
    let batch = arrays.count
    let seq = arrays.first?.count ?? 0

    let mlArray = try MLMultiArray(shape: [NSNumber(value: batch), NSNumber(value: seq)], dataType: .int32)

    for b in 0..<batch {
      let row = arrays[b]
      if row.count != seq {
        throw CoreMLLLMError("Inconsistent sequence length")
      }
      for s in 0..<seq {
        mlArray[[NSNumber(value: b), NSNumber(value: s)]] = NSNumber(value: Int32(row[s]))
      }
    }

    return MLFeatureValue(multiArray: mlArray)
  }

  private static func parseComputeUnits(_ s: String) -> MLComputeUnits {
    switch s {
    case "cpuOnly": return .cpuOnly
    case "cpuAndGPU": return .cpuAndGPU
    case "cpuAndNeuralEngine": return .cpuAndNeuralEngine
    default: return .all
    }
  }

  private static func resolveBundleModelURL(modelName: String, ext: String) -> URL? {
    if let u = ExpoCoreMLLLMBundles.resolveResourceURL(bundle: Bundle.main, path: modelName + "." + ext) {
      return u
    }
    if let u = ExpoCoreMLLLMBundles.resolveResourceURL(bundle: ExpoCoreMLLLMBundles.resourcesBundle, path: modelName + "." + ext) {
      return u
    }
    return nil
  }
}

public struct CoreMLLLMError: Error, LocalizedError {
  public let message: String
  public init(_ message: String) { self.message = message }
  public var errorDescription: String? { message }
}
