import Foundation

public final class GPT2BPETokenizer {
  public struct Config {
    public let vocab: [String: Int]
    public let idToToken: [Int: String]
    public let merges: [Pair: Int]
    public let byteEncoder: [UInt8: String]
    public let byteDecoder: [String: UInt8]
    public let bosTokenId: Int?
    public let eosTokenId: Int?

    public init(vocab: [String: Int], merges: [Pair: Int], bosTokenId: Int?, eosTokenId: Int?) {
      self.vocab = vocab
      var inv: [Int: String] = [:]
      inv.reserveCapacity(vocab.count)
      for (tok, id) in vocab { inv[id] = tok }
      self.idToToken = inv
      self.merges = merges
      let (enc, dec) = GPT2BPETokenizer.makeByteEncoder()
      self.byteEncoder = enc
      self.byteDecoder = dec
      self.bosTokenId = bosTokenId
      self.eosTokenId = eosTokenId
    }
  }

  public struct Pair: Hashable {
    public let a: String
    public let b: String
    public init(_ a: String, _ b: String) { self.a = a; self.b = b }
  }

  private let cfg: Config
  private var cache: [String: [String]] = [:]

  private static let pat = try! NSRegularExpression(pattern: "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+", options: [])

  public init(config: Config) {
    self.cfg = config
    self.cache.reserveCapacity(4096)
  }

  public static func fromBundle(tokenizer: [String: Any]) throws -> GPT2BPETokenizer {
    guard let vocabPath = tokenizer["vocabJsonAssetPath"] as? String,
          let mergesPath = tokenizer["mergesTxtAssetPath"] as? String else {
      throw CoreMLLLMError("Tokenizer requires vocabJsonAssetPath and mergesTxtAssetPath")
    }

    let bos = tokenizer["bosTokenId"] as? Int
    let eos = tokenizer["eosTokenId"] as? Int

    let vocabURL = try resolveURL(path: vocabPath)
    let mergesURL = try resolveURL(path: mergesPath)

    let vocabData = try Data(contentsOf: vocabURL)
    let vocabAny = try JSONSerialization.jsonObject(with: vocabData, options: [])
    guard let vocab = vocabAny as? [String: Int] else {
      throw CoreMLLLMError("Invalid vocab.json format")
    }

    let mergesText = try String(contentsOf: mergesURL, encoding: .utf8)
    var merges: [Pair: Int] = [:]
    merges.reserveCapacity(50000)

    var rank = 0
    for line in mergesText.split(separator: "\n") {
      let l = line.trimmingCharacters(in: .whitespacesAndNewlines)
      if l.isEmpty { continue }
      if l.hasPrefix("#") { continue }
      let parts = l.split(separator: " ")
      if parts.count != 2 { continue }
      merges[Pair(String(parts[0]), String(parts[1]))] = rank
      rank += 1
    }

    return GPT2BPETokenizer(config: Config(vocab: vocab, merges: merges, bosTokenId: bos, eosTokenId: eos))
  }

  private static func resolveURL(path: String) throws -> URL {
    let (scheme, raw) : (String, String) = {
      if path.hasPrefix("bundle:") { return ("bundle", String(path.dropFirst("bundle:".count))) }
      if path.hasPrefix("module:") { return ("module", String(path.dropFirst("module:".count))) }
      if path.hasPrefix("/") { return ("file", path) }
      return ("bundle", path)
    }()

    if scheme == "file" {
      return URL(fileURLWithPath: raw)
    }

    let bundle: Bundle = (scheme == "module") ? ExpoCoreMLLLMBundles.resourcesBundle : Bundle.main
    if let u = ExpoCoreMLLLMBundles.resolveResourceURL(bundle: bundle, path: raw) { return u }

    throw CoreMLLLMError("Resource not found: \(path)")
  }

  public func encode(_ text: String) throws -> [Int] {
    var ids: [Int] = []

    if let bos = cfg.bosTokenId { ids.append(bos) }

    let ns = text as NSString
    let matches = Self.pat.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length))

    for m in matches {
      let token = ns.substring(with: m.range)
      let bpeTokens = try self.bpe(token)
      for bt in bpeTokens {
        guard let id = cfg.vocab[bt] else {
          throw CoreMLLLMError("Token not in vocab: \(bt)")
        }
        ids.append(id)
      }
    }

    return ids
  }

  public func decode(_ tokenIds: [Int]) -> String {
    var pieces: [String] = []
    pieces.reserveCapacity(tokenIds.count)

    for id in tokenIds {
      if let bos = cfg.bosTokenId, id == bos { continue }
      if let eos = cfg.eosTokenId, id == eos { continue }
      guard let tok = cfg.idToToken[id] else { continue }
      pieces.append(tok)
    }

    let text = pieces.joined()

    var bytes: [UInt8] = []
    bytes.reserveCapacity(text.utf8.count)

    for ch in text {
      let s = String(ch)
      if let b = cfg.byteDecoder[s] {
        bytes.append(b)
      } else {
        bytes.append(contentsOf: s.utf8)
      }
    }

    return String(decoding: bytes, as: UTF8.self)
  }

  private func bpe(_ token: String) throws -> [String] {
    if let cached = cache[token] { return cached }

    var chars: [String] = []
    chars.reserveCapacity(token.utf8.count)
    for b in token.utf8 {
      chars.append(cfg.byteEncoder[b] ?? String(UnicodeScalar(b)))
    }

    var word = chars

    func getPairs(_ w: [String]) -> Set<Pair> {
      if w.count < 2 { return [] }
      var pairs = Set<Pair>()
      pairs.reserveCapacity(w.count)
      for i in 0..<(w.count - 1) {
        pairs.insert(Pair(w[i], w[i+1]))
      }
      return pairs
    }

    var pairs = getPairs(word)
    if pairs.isEmpty {
      cache[token] = [word.joined()]
      return [word.joined()]
    }

    while true {
      var minRank = Int.max
      var best: Pair? = nil
      for p in pairs {
        if let r = cfg.merges[p], r < minRank {
          minRank = r
          best = p
        }
      }
      guard let bp = best else { break }

      let first = bp.a
      let second = bp.b

      var newWord: [String] = []
      newWord.reserveCapacity(word.count)

      var i = 0
      while i < word.count {
        if i < word.count - 1 && word[i] == first && word[i+1] == second {
          newWord.append(first + second)
          i += 2
        } else {
          newWord.append(word[i])
          i += 1
        }
      }

      word = newWord
      if word.count == 1 { break }
      pairs = getPairs(word)
    }

    let out = word
    cache[token] = out
    return out
  }

  private static func makeByteEncoder() -> ([UInt8: String], [String: UInt8]) {
    var bs: [UInt8] = []
    bs.reserveCapacity(256)

    bs.append(contentsOf: Array(33...126))
    bs.append(contentsOf: Array(161...172))
    bs.append(contentsOf: Array(174...255))

    var cs: [UInt32] = bs.map { UInt32($0) }

    var n: UInt32 = 0
    for b in UInt8.min...UInt8.max {
      if !bs.contains(b) {
        bs.append(b)
        cs.append(256 + n)
        n += 1
      }
    }

    var encoder: [UInt8: String] = [:]
    encoder.reserveCapacity(256)
    var decoder: [String: UInt8] = [:]
    decoder.reserveCapacity(256)

    for (b, c) in zip(bs, cs) {
      let s = String(UnicodeScalar(c)!)
      encoder[b] = s
      decoder[s] = b
    }

    return (encoder, decoder)
  }
}
