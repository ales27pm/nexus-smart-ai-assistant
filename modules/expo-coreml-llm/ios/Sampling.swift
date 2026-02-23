import Foundation

struct Sampling {
  static func softmax(_ logits: [Float], temperature: Float) -> [Float] {
    let t = max(temperature, 1e-6)
    let scaled = logits.map { $0 / t }
    let m = scaled.max() ?? 0
    let exps = scaled.map { expf($0 - m) }
    let sum = exps.reduce(0, +)
    if sum <= 0 { return Array(repeating: 0, count: logits.count) }
    return exps.map { $0 / sum }
  }

  static func applyRepetitionPenalty(_ logits: inout [Float], tokenIds: [Int], penalty: Float) {
    guard penalty > 1.0 else { return }
    var seen = Set<Int>()
    for id in tokenIds { seen.insert(id) }
    for id in seen {
      if id >= 0 && id < logits.count {
        let v = logits[id]
        logits[id] = v < 0 ? (v * penalty) : (v / penalty)
      }
    }
  }

  static func topKFilter(_ probs: inout [Float], k: Int) {
    guard k > 0 && k < probs.count else { return }
    let indexed = probs.enumerated().sorted { $0.element > $1.element }
    let keep = Set(indexed.prefix(k).map { $0.offset })
    for i in 0..<probs.count {
      if !keep.contains(i) { probs[i] = 0 }
    }
    renormalize(&probs)
  }

  static func topPFilter(_ probs: inout [Float], p: Float) {
    let pp = min(max(p, 0), 1)
    guard pp < 1 else { return }

    let indexed = probs.enumerated().sorted { $0.element > $1.element }
    var cumulative: Float = 0
    var keep = Set<Int>()
    for item in indexed {
      cumulative += item.element
      keep.insert(item.offset)
      if cumulative >= pp {
        break
      }
    }

    for i in 0..<probs.count where !keep.contains(i) {
      probs[i] = 0
    }
    renormalize(&probs)
  }

  static func renormalize(_ probs: inout [Float]) {
    let s = probs.reduce(0, +)
    if s <= 0 {
      let uniform = 1.0 / Float(max(probs.count, 1))
      probs = Array(repeating: uniform, count: probs.count)
      return
    }
    for i in 0..<probs.count { probs[i] /= s }
  }

  static func sample<R: RandomNumberGenerator>(probs: [Float], rng: inout R) -> Int {
    let randomValue = Float.random(in: 0..<1, using: &rng)
    return sample(probs: probs, randomValue: randomValue)
  }

  static func sample(probs: [Float], randomValue: Float) -> Int {
    guard !probs.isEmpty else { return 0 }  // or preconditionFailure("probs must not be empty")
    let r = min(max(randomValue, 0), 0.999_999_94)
    var cum: Float = 0
    for (i, p) in probs.enumerated() {
      cum += p
      if r < cum { return i }
    }
    return max(0, probs.count - 1)
  }
}

struct SeededGenerator: RandomNumberGenerator {
  private var state: UInt64

  init(seed: Int) {
    self.state = UInt64(bitPattern: Int64(seed))
    if self.state == 0 { self.state = 0xdeadbeefcafebabe }
  }

  mutating func next() -> UInt64 {
    var x = state
    x ^= x >> 12
    x ^= x << 25
    x ^= x >> 27
    state = x
    return x &* 2685821657736338717
  }
}
