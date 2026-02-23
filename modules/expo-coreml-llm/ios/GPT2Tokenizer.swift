import Foundation

protocol Tokenizer {
  var eosTokenId: Int? { get }
  func encode(_ text: String) -> [Int]
  func decode(_ tokenIds: [Int]) -> String
}

final class GPT2BPETokenizer: Tokenizer {
  private let encoder: [String: Int]
  private let decoder: [Int: String]
  private let bpeRanks: [Pair: Int]
  private let byteEncoder: [UInt8: String]
  private let byteDecoder: [String: UInt8]
  private let cache = NSCache<NSString, NSArray>()

  let bosTokenId: Int?
  let eosTokenId: Int?

  struct Pair: Hashable {
    let a: String
    let b: String
  }

  init(vocabURL: URL, mergesURL: URL, bosTokenId: Int?, eosTokenId: Int?) throws {
    self.bosTokenId = bosTokenId
    self.eosTokenId = eosTokenId

    let vocabData = try Data(contentsOf: vocabURL)
    let json = try JSONSerialization.jsonObject(with: vocabData, options: [])
    guard let dict = json as? [String: Any] else {
      throw NSError(domain: "ExpoCoreMLLLM", code: 300, userInfo: [NSLocalizedDescriptionKey: "Invalid vocab.json"])
    }

    var enc: [String: Int] = [:]
    for (k, v) in dict {
      if let i = v as? Int { enc[k] = i }
      else if let n = v as? NSNumber { enc[k] = n.intValue }
    }
    self.encoder = enc

    var dec: [Int: String] = [:]
    for (k, v) in enc {
      dec[v] = k
    }
    self.decoder = dec

    // merges.txt format: header + "a b" per line
    let mergesTxt = try String(contentsOf: mergesURL, encoding: .utf8)
    let lines = mergesTxt.split(separator: "\n").map(String.init)

    var ranks: [Pair: Int] = [:]
    var idx = 0
    for line in lines {
      if line.hasPrefix("#") { continue }
      let parts = line.split(separator: " ")
      if parts.count != 2 { continue }
      ranks[Pair(a: String(parts[0]), b: String(parts[1]))] = idx
      idx += 1
    }
    self.bpeRanks = ranks

    let (be, bd) = GPT2BPETokenizer.buildByteMaps()
    self.byteEncoder = be
    self.byteDecoder = bd
  }

  // MARK: Public

  func encode(_ text: String) -> [Int] {
    var ids: [Int] = []
    if let bos = bosTokenId { ids.append(bos) }

    let tokens = GPT2BPETokenizer.gpt2RegexTokens(text)
    for tok in tokens {
      let bytes = Array(tok.utf8)
      // Invariant: buildByteMaps() must populate all 0...255 byte mappings.
      let transformed = bytes.map { b -> String in
        guard let mapped = byteEncoder[b] else {
          preconditionFailure("byteEncoder missing mapping for \(b); buildByteMaps() must populate 0...255")
        }
        return mapped
      }.joined()
      let bpeTokens = bpe(transformed)
      for bt in bpeTokens {
        if let id = encoder[bt] {
          ids.append(id)
        } else {
          // Fallback: unknown token: try each char
          for ch in bt {
            let s = String(ch)
            if let cid = encoder[s] { ids.append(cid) }
          }
        }
      }
    }

    return ids
  }

  func decode(_ tokenIds: [Int]) -> String {
    var text = ""
    for id in tokenIds {
      if let bos = bosTokenId, id == bos { continue }
      if let eos = eosTokenId, id == eos { continue }
      if let piece = decoder[id] {
        text += piece
      } else {
        text += "�"
      }
    }
    // Byte-level decode: each scalar in `text` maps to a single byte via GPT-2 byte decoder.
    var bytes: [UInt8] = []
    bytes.reserveCapacity(text.count)
    for ch in text {
      let s = String(ch)
      if let b = byteDecoder[s] {
        bytes.append(b)
      }
    }
    return String(decoding: bytes, as: UTF8.self)
  }

  // MARK: BPE

  private func bpe(_ token: String) -> [String] {
    if let cached = cache.object(forKey: token as NSString) as? [String] {
      return cached
    }

    var word = token.map { String($0) }
    var pairs = getPairs(word)

    while true {
      guard let best = pairs.min(by: { (a, b) -> Bool in
        let ra = bpeRanks[Pair(a: a.a, b: a.b)] ?? Int.max
        let rb = bpeRanks[Pair(a: b.a, b: b.b)] ?? Int.max
        return ra < rb
      }) else {
        break
      }

      let rank = bpeRanks[Pair(a: best.a, b: best.b)] ?? Int.max
      if rank == Int.max {
        break
      }

      var newWord: [String] = []
      var i = 0
      while i < word.count {
        if i < word.count - 1, word[i] == best.a, word[i + 1] == best.b {
          newWord.append(best.a + best.b)
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

    cache.setObject(word as NSArray, forKey: token as NSString)
    return word
  }

  private func getPairs(_ word: [String]) -> [Pair] {
    guard word.count >= 2 else { return [] }
    var res: [Pair] = []
    res.reserveCapacity(word.count - 1)
    for i in 0..<(word.count - 1) {
      res.append(Pair(a: word[i], b: word[i + 1]))
    }
    return res
  }

  // MARK: Byte maps & regex tokenization

  private static func buildByteMaps() -> ([UInt8: String], [String: UInt8]) {
    // GPT-2 byte encoder mapping used by OpenAI tokenizer.
    // It maps bytes to unicode characters from a curated set to avoid control chars.
    var bs = [UInt8]()
    bs.append(contentsOf: Array(UInt8(33)...UInt8(126)))
    bs.append(contentsOf: Array(UInt8(161)...UInt8(172)))
    bs.append(contentsOf: Array(UInt8(174)...UInt8(255)))

    var cs = bs.map { Int($0) }
    var n = 0
    for b in 0...255 {
      if !bs.contains(UInt8(b)) {
        bs.append(UInt8(b))
        cs.append(256 + n)
        n += 1
      }
    }

    var be: [UInt8: String] = [:]
    var bd: [String: UInt8] = [:]
    for (b, c) in zip(bs, cs) {
      let s = String(UnicodeScalar(c)!)
      be[b] = s
      bd[s] = b
    }
    return (be, bd)
  }

  private static func gpt2RegexTokens(_ text: String) -> [String] {
    // A pragmatic GPT-2-like tokenizer regex:
    // - splits on words, numbers, punctuation, whitespace
    // Not 100% identical to python regex, but compatible enough for real BPE vocab/merges.
    //
    // If you need exact parity, we can implement the full OpenAI regex.
    let pattern = #"'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+"#
    let ns = text as NSString
    do {
      let re = try NSRegularExpression(pattern: pattern, options: [])
      let matches = re.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length))
      return matches.map { ns.substring(with: $0.range) }
    } catch {
      // Conservative fallback: preserve full text if regex construction fails.
      return [text]
    }
  }
}


typealias GPT2Tokenizer = GPT2BPETokenizer
