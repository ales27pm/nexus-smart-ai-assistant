import Foundation

public enum Sampling {
  public static func sample(logits: [Double], topK: Int, topP: Double, rng: SeededRNG) throws -> Int {
    let n = logits.count
    if n == 0 { throw CoreMLLLMError("Empty logits") }

    var maxVal = logits[0]
    for i in 1..<n { if logits[i] > maxVal { maxVal = logits[i] } }

    var exps = [Double](repeating: 0.0, count: n)
    var sum = 0.0
    for i in 0..<n {
      let e = Foundation.exp(logits[i] - maxVal)
      exps[i] = e
      sum += e
    }

    if sum == 0 { throw CoreMLLLMError("Softmax underflow") }

    let probs = exps.map { $0 / sum }

    var idx = Array(0..<n)
    idx.sort { probs[$0] > probs[$1] }

    if topK > 0 && topK < idx.count {
      idx = Array(idx.prefix(topK))
    }

    if topP < 1.0 {
      var cum = 0.0
      var nucleus: [Int] = []
      nucleus.reserveCapacity(idx.count)
      for i in idx {
        nucleus.append(i)
        cum += probs[i]
        if cum >= topP { break }
      }
      idx = nucleus
    }

    var filteredSum = 0.0
    for i in idx { filteredSum += probs[i] }
    if filteredSum <= 0 {
      return idx.first ?? 0
    }

    let r = rng.nextDouble()
    var running = 0.0
    for i in idx {
      running += probs[i] / filteredSum
      if r <= running { return i }
    }

    return idx.last ?? 0
  }
}
