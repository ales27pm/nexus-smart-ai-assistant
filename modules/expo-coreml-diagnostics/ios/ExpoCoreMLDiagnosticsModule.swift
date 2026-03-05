import ExpoModulesCore

private struct DiagnosticErrorDescriptor {
  let code: String
  let numericCode: Int
  let message: String
  let retryable: Bool
  let category: String

  var payload: [String: Any] {
    [
      "code": code,
      "numericCode": numericCode,
      "message": message,
      "retryable": retryable,
      "category": category,
    ]
  }
}

public final class ExpoCoreMLDiagnosticsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ExpoCoreMLDiagnosticsModule")

    AsyncFunction("isEnabledAsync") { () -> Bool in
      #if DEBUG
      return true
      #else
      return false
      #endif
    }

    AsyncFunction("delayResolveAsync") { (durationMs: Int) -> [String: Any] in
      #if DEBUG
      let safeDuration = max(0, min(durationMs, 60_000))
      if safeDuration > 0 {
        try await Task.sleep(nanoseconds: UInt64(safeDuration) * 1_000_000)
      }
      return ["delayedMs": safeDuration]
      #else
      throw NSError(
        domain: "ExpoCoreMLDiagnostics",
        code: 990,
        userInfo: [NSLocalizedDescriptionKey: "ExpoCoreMLDiagnostics is disabled in production builds."]
      )
      #endif
    }

    AsyncFunction("describeErrorAsync") { (code: String) -> [String: Any] in
      #if DEBUG
      return self.resolveDescriptor(code: code).payload
      #else
      throw NSError(
        domain: "ExpoCoreMLDiagnostics",
        code: 990,
        userInfo: [NSLocalizedDescriptionKey: "ExpoCoreMLDiagnostics is disabled in production builds."]
      )
      #endif
    }

    AsyncFunction("throwErrorAsync") { (code: String) -> Void in
      #if DEBUG
      let descriptor = self.resolveDescriptor(code: code)
      throw NSError(
        domain: "ExpoCoreMLDiagnostics",
        code: descriptor.numericCode,
        userInfo: [
          NSLocalizedDescriptionKey: descriptor.message,
          "diagnosticCode": descriptor.code,
          "retryable": descriptor.retryable,
          "category": descriptor.category,
        ]
      )
      #else
      throw NSError(
        domain: "ExpoCoreMLDiagnostics",
        code: 990,
        userInfo: [NSLocalizedDescriptionKey: "ExpoCoreMLDiagnostics is disabled in production builds."]
      )
      #endif
    }
  }

  private func resolveDescriptor(code: String) -> DiagnosticErrorDescriptor {
    switch code.uppercased() {
    case "MEMORY_PRESSURE":
      return DiagnosticErrorDescriptor(
        code: "MEMORY_PRESSURE",
        numericCode: 901,
        message: "CoreML inference paused due to simulated memory pressure.",
        retryable: true,
        category: "memory"
      )
    case "MODEL_EVICTED":
      return DiagnosticErrorDescriptor(
        code: "MODEL_EVICTED",
        numericCode: 902,
        message: "CoreML model was evicted from memory and must be reloaded.",
        retryable: true,
        category: "state"
      )
    case "BRIDGE_TIMEOUT":
      return DiagnosticErrorDescriptor(
        code: "BRIDGE_TIMEOUT",
        numericCode: 903,
        message: "Bridge operation timed out before completion.",
        retryable: false,
        category: "bridge"
      )
    default:
      return DiagnosticErrorDescriptor(
        code: "UNKNOWN",
        numericCode: 999,
        message: "Unknown diagnostic error.",
        retryable: false,
        category: "generic"
      )
    }
  }
}
