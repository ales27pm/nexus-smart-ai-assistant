import Foundation

enum Types {
  enum CoreMLComputeUnits: String {
    case all
    case cpuOnly
    case cpuAndGPU
    case cpuAndNeuralEngine
  }

  enum TokenizerKind: String {
    case none
    case gpt2_bpe
  }

  struct LoadModelOptions {
    let modelFile: String?
    let modelPath: String?
    let modelName: String?

    let inputIdsName: String
    let attentionMaskName: String
    let cachePositionName: String
    let logitsName: String

    let eosTokenId: Int?
    let maxContext: Int?

    let computeUnits: CoreMLComputeUnits

    init(from dict: [String: Any]) throws {
      self.modelFile = dict["modelFile"] as? String
      self.modelPath = dict["modelPath"] as? String
      self.modelName = dict["modelName"] as? String

      self.inputIdsName = (dict["inputIdsName"] as? String) ?? "input_ids"
      self.attentionMaskName = (dict["attentionMaskName"] as? String) ?? "attention_mask"
      self.cachePositionName = (dict["cachePositionName"] as? String) ?? "cache_position"
      self.logitsName = (dict["logitsName"] as? String) ?? "logits"

      self.eosTokenId = dict["eosTokenId"] as? Int
      self.maxContext = dict["maxContext"] as? Int

      self.computeUnits = CoreMLComputeUnits(rawValue: (dict["computeUnits"] as? String) ?? "all") ?? .all
    }
  }

  struct TokenizerConfig {
    let kind: TokenizerKind
    let vocabJsonAssetPath: String?
    let mergesTxtAssetPath: String?
    let bosTokenId: Int?
    let eosTokenId: Int?

    init(from dict: [String: Any]) throws {
      self.kind = TokenizerKind(rawValue: (dict["kind"] as? String) ?? "gpt2_bpe") ?? .gpt2_bpe
      self.vocabJsonAssetPath = dict["vocabJsonAssetPath"] as? String
      self.mergesTxtAssetPath = dict["mergesTxtAssetPath"] as? String
      self.bosTokenId = dict["bosTokenId"] as? Int
      self.eosTokenId = dict["eosTokenId"] as? Int

      if kind == .gpt2_bpe {
        guard vocabJsonAssetPath != nil, mergesTxtAssetPath != nil else {
          throw NSError(domain: "ExpoCoreMLLLM", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "tokenizer.kind=gpt2_bpe requires vocabJsonAssetPath and mergesTxtAssetPath"
          ])
        }
      }
    }
  }

  struct GenerateOptions {
    let maxNewTokens: Int
    let temperature: Float
    let topK: Int
    let topP: Float
    let repetitionPenalty: Float
    let stopTokenIds: [Int]
    let seed: Int?
    let tokenizer: [String: Any]?

    init(from dict: [String: Any]) throws {
      self.maxNewTokens = (dict["maxNewTokens"] as? Int) ?? 128
      self.temperature = Float((dict["temperature"] as? Double) ?? 0.8)
      self.topK = (dict["topK"] as? Int) ?? 40
      self.topP = Float((dict["topP"] as? Double) ?? 0.95)
      self.repetitionPenalty = Float((dict["repetitionPenalty"] as? Double) ?? 1.0)
      self.stopTokenIds = (dict["stopTokenIds"] as? [Int]) ?? []
      self.seed = dict["seed"] as? Int
      self.tokenizer = dict["tokenizer"] as? [String: Any]
    }
  }

  struct GenerateFromTokensOptions {
    let maxNewTokens: Int
    let temperature: Float
    let topK: Int
    let topP: Float
    let repetitionPenalty: Float
    let stopTokenIds: [Int]
    let seed: Int?
    let maxContext: Int?

    init(from dict: [String: Any]) throws {
      self.maxNewTokens = (dict["maxNewTokens"] as? Int) ?? 128
      self.temperature = Float((dict["temperature"] as? Double) ?? 0.8)
      self.topK = (dict["topK"] as? Int) ?? 40
      self.topP = Float((dict["topP"] as? Double) ?? 0.95)
      self.repetitionPenalty = Float((dict["repetitionPenalty"] as? Double) ?? 1.0)
      self.stopTokenIds = (dict["stopTokenIds"] as? [Int]) ?? []
      self.seed = dict["seed"] as? Int
      self.maxContext = dict["maxContext"] as? Int
    }
  }

  struct ModelInfo {
    let loaded: Bool
    let modelURL: String
    let computeUnits: CoreMLComputeUnits
    let expectsSingleToken: Bool
    let hasState: Bool
    let inputIdsName: String
    let attentionMaskName: String
    let cachePositionName: String
    let logitsName: String
    let eosTokenId: Int?
    let maxContext: Int?

    func toDict() -> [String: Any] {
      var d: [String: Any] = [
        "loaded": loaded,
        "modelURL": modelURL,
        "computeUnits": computeUnits.rawValue,
        "expectsSingleToken": expectsSingleToken,
        "hasState": hasState,
        "inputIdsName": inputIdsName,
        "attentionMaskName": attentionMaskName,
        "cachePositionName": cachePositionName,
        "logitsName": logitsName,
      ]
      if let v = eosTokenId { d["eosTokenId"] = v }
      if let v = maxContext { d["maxContext"] = v }
      return d
    }
  }
}
