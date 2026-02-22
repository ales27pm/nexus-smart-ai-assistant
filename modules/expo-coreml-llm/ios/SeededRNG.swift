import Foundation
import Security

public final class SeededRNG {
  private var state: UInt64 = 0x9E3779B97F4A7C15

  public init() {}

  public func seed(_ s: UInt64) {
    state = s != 0 ? s : 0x9E3779B97F4A7C15
  }

  public func seedRandom() {
    var s: UInt64 = 0
    _ = withUnsafeMutableBytes(of: &s) { SecRandomCopyBytes(kSecRandomDefault, MemoryLayout<UInt64>.size, $0.baseAddress!) }
    seed(s)
  }

  public func nextUInt64() -> UInt64 {
    var x = state
    x ^= x >> 12
    x ^= x << 25
    x ^= x >> 27
    state = x
    return x &* 2685821657736338717
  }

  public func nextDouble() -> Double {
    let u = nextUInt64() >> 11
    return Double(u) / Double(1 << 53)
  }
}
