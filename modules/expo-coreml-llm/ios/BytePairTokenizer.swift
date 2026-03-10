import Foundation

protocol CoreMLTokenizer {
    func encode(_ text: String) throws -> [Int]
    func decode(_ tokenIds: [Int]) throws -> String
}

enum CoreMLTokenizerError: LocalizedError {
    case invalidConfiguration(String)
    case assetMissing(String)
    case malformedVocabulary(String)
    case malformedMerges(String)
    case unknownToken(String)

    var errorDescription: String? {
        switch self {
        case .invalidConfiguration(let message):
            return message
        case .assetMissing(let message):
            return message
        case .malformedVocabulary(let message):
            return message
        case .malformedMerges(let message):
            return message
        case .unknownToken(let token):
            return "Tokenizer token not found in vocabulary: \(token)"
        }
    }
}

struct TokenizerConfig: Sendable {
    let kind: String
    let vocabJsonAssetPath: String?
    let mergesTxtAssetPath: String?
    let bosTokenId: Int?
    let eosTokenId: Int?

    init(dict: [String: Any]) {
        self.kind = (dict["kind"] as? String) ?? "byte_level_bpe"
        self.vocabJsonAssetPath = dict["vocabJsonAssetPath"] as? String
        self.mergesTxtAssetPath = dict["mergesTxtAssetPath"] as? String
        self.bosTokenId = dict["bosTokenId"] as? Int
        self.eosTokenId = dict["eosTokenId"] as? Int
    }
}

final class BytePairTokenizer: CoreMLTokenizer {
    private let encoder: [String: Int]
    private let decoder: [Int: String]
    private let bpeRanks: [Pair: Int]
    private let byteEncoder: [UInt8: String]
    private let byteDecoder: [String: UInt8]
    private let regex: NSRegularExpression
    private let bosTokenId: Int?
    private let eosTokenId: Int?
    private var cache: [String: [String]] = [:]
    private let cacheLock = NSLock()

    private struct Pair: Hashable {
        let left: String
        let right: String
    }

    init(vocabJSON: URL, mergesTXT: URL, bosTokenId: Int?, eosTokenId: Int?) throws {
        let vocabData = try Data(contentsOf: vocabJSON)
        let mergesText = try String(contentsOf: mergesTXT, encoding: .utf8)

        guard let rawVocab = try JSONSerialization.jsonObject(with: vocabData) as? [String: Int] else {
            throw CoreMLTokenizerError.malformedVocabulary("Tokenizer vocab JSON is not a string->int dictionary.")
        }

        var decoder: [Int: String] = [:]
        for (token, id) in rawVocab {
            decoder[id] = token
        }

        self.encoder = rawVocab
        self.decoder = decoder
        self.bosTokenId = bosTokenId
        self.eosTokenId = eosTokenId

        let mapping = BytePairTokenizer.bytesToUnicode()
        self.byteEncoder = mapping
        self.byteDecoder = Dictionary(uniqueKeysWithValues: mapping.map { ($1, $0) })

        var rankMap: [Pair: Int] = [:]
        let lines = mergesText.split(whereSeparator: \.isNewline)
        for (index, rawLine) in lines.enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.isEmpty || line.hasPrefix("#") { continue }
            let parts = line.split(separator: " ").map(String.init)
            guard parts.count == 2 else {
                throw CoreMLTokenizerError.malformedMerges("Tokenizer merges file contains malformed line: \(line)")
            }
            rankMap[Pair(left: parts[0], right: parts[1])] = index
        }
        self.bpeRanks = rankMap

        self.regex = try NSRegularExpression(
            pattern: "'s|'t|'re|'ve|'m|'ll|'d| ?\\p{L}+| ?\\p{N}+| ?[^\\s\\p{L}\\p{N}]+|\\s+(?!\\S)|\\s+",
            options: []
        )
    }

    func encode(_ text: String) throws -> [Int] {
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, options: [], range: range)
        var tokenIds: [Int] = []
        tokenIds.reserveCapacity(max(8, text.count))

        for match in matches {
            guard let matchRange = Range(match.range, in: text) else { continue }
            let piece = String(text[matchRange])
            let transformed = try piece.utf8.map { byte -> String in
                if let mapped = byteEncoder[byte] {
                    return mapped
                }
                throw CoreMLTokenizerError.malformedVocabulary("Missing byte encoder mapping for byte \(byte)")
            }.joined()

            let symbols = bpe(token: transformed)
            for symbol in symbols {
                guard let id = encoder[symbol] else {
                    throw CoreMLTokenizerError.unknownToken(symbol)
                }
                tokenIds.append(id)
            }
        }

        return tokenIds
    }

    func decode(_ tokenIds: [Int]) throws -> String {
        let merged = try tokenIds.map { tokenId -> String in
            guard let token = decoder[tokenId] else {
                throw CoreMLTokenizerError.invalidConfiguration("Token id \(tokenId) is not present in tokenizer vocabulary.")
            }
            return token
        }.joined()

        var bytes: [UInt8] = []
        bytes.reserveCapacity(merged.count)

        for scalar in merged.unicodeScalars {
            let key = String(scalar)
            if let byte = byteDecoder[key] {
                bytes.append(byte)
                continue
            }

            let utf8Bytes = Array(key.utf8)
            if utf8Bytes.count == 1 {
                bytes.append(utf8Bytes[0])
            } else {
                bytes.append(contentsOf: utf8Bytes)
            }
        }

        return String(decoding: bytes, as: UTF8.self)
    }

    private func bpe(token: String) -> [String] {
        cacheLock.lock()
        if let cached = cache[token] {
            cacheLock.unlock()
            return cached
        }
        cacheLock.unlock()

        var word = token.map { String($0) }
        if word.count <= 1 {
            cacheLock.lock()
            cache[token] = word
            cacheLock.unlock()
            return word
        }

        while true {
            let pairs = getPairs(word)
            guard !pairs.isEmpty else { break }

            var minRank = Int.max
            var candidate: Pair?
            for pair in pairs {
                if let rank = bpeRanks[pair], rank < minRank {
                    minRank = rank
                    candidate = pair
                }
            }

            guard let best = candidate else { break }

            var newWord: [String] = []
            var index = 0
            while index < word.count {
                if index < word.count - 1,
                   word[index] == best.left,
                   word[index + 1] == best.right {
                    newWord.append(best.left + best.right)
                    index += 2
                } else {
                    newWord.append(word[index])
                    index += 1
                }
            }

            word = newWord
            if word.count <= 1 { break }
        }

        cacheLock.lock()
        cache[token] = word
        cacheLock.unlock()
        return word
    }

    private func getPairs(_ word: [String]) -> Set<Pair> {
        guard word.count > 1 else { return [] }
        var pairs = Set<Pair>()
        for index in 0..<(word.count - 1) {
            pairs.insert(Pair(left: word[index], right: word[index + 1]))
        }
        return pairs
    }

    private static func bytesToUnicode() -> [UInt8: String] {
        var bs: [UInt8] = Array(33...126) + Array(161...172) + Array(174...255)
        var cs: [Int] = bs.map(Int.init)
        var next = 0

        for b in UInt8.min...UInt8.max {
            if !bs.contains(b) {
                bs.append(b)
                cs.append(256 + next)
                next += 1
            }
        }

        var mapping: [UInt8: String] = [:]
        for (byte, scalarValue) in zip(bs, cs) {
            if let scalar = UnicodeScalar(scalarValue) {
                mapping[byte] = String(scalar)
            }
        }
        return mapping
    }
}

final class CoreMLTokenizerFactory {
    static let shared = CoreMLTokenizerFactory()

    private let lock = NSLock()
    private var cache: [String: CoreMLTokenizer] = [:]

    func makeTokenizer(config: TokenizerConfig) throws -> CoreMLTokenizer {
        if config.kind == "none" {
            throw CoreMLTokenizerError.invalidConfiguration("tokenizer.kind='none' is invalid for tokenize/decode/generate paths that require a tokenizer.")
        }

        let vocabPath = try resolveRequiredAssetPath(config.vocabJsonAssetPath, label: "vocabJsonAssetPath")
        let mergesPath = try resolveRequiredAssetPath(config.mergesTxtAssetPath, label: "mergesTxtAssetPath")

        let cacheKey = [config.kind, vocabPath, mergesPath, String(config.bosTokenId ?? -1), String(config.eosTokenId ?? -1)].joined(separator: "|")

        lock.lock()
        if let existing = cache[cacheKey] {
            lock.unlock()
            return existing
        }
        lock.unlock()

        let tokenizer = try BytePairTokenizer(
            vocabJSON: URL(fileURLWithPath: vocabPath),
            mergesTXT: URL(fileURLWithPath: mergesPath),
            bosTokenId: config.bosTokenId,
            eosTokenId: config.eosTokenId
        )

        lock.lock()
        cache[cacheKey] = tokenizer
        lock.unlock()
        return tokenizer
    }

    private func resolveRequiredAssetPath(_ rawValue: String?, label: String) throws -> String {
        guard let raw = rawValue?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            throw CoreMLTokenizerError.invalidConfiguration("Tokenizer config missing \(label).")
        }

        if raw.hasPrefix("module:") {
            let relative = String(raw.dropFirst("module:".count))
            let bundle = Bundle.main
            let bundleCandidates = [
                bundle.resourceURL,
                bundle.bundleURL,
                Bundle(for: CoreMLModelLoader.self).resourceURL,
                Bundle(for: CoreMLModelLoader.self).bundleURL
            ].compactMap { $0 }

            for candidate in bundleCandidates {
                let path = candidate.appendingPathComponent(relative).path
                if FileManager.default.fileExists(atPath: path) {
                    return path
                }
                let bundleResourcePath = candidate.appendingPathComponent("ExpoCoreMLLLMResources.bundle").appendingPathComponent(relative).path
                if FileManager.default.fileExists(atPath: bundleResourcePath) {
                    return bundleResourcePath
                }
            }

            throw CoreMLTokenizerError.assetMissing("Tokenizer asset not found for module path: \(raw)")
        }

        let expanded = (raw as NSString).expandingTildeInPath
        if FileManager.default.fileExists(atPath: expanded) {
            return expanded
        }

        throw CoreMLTokenizerError.assetMissing("Tokenizer asset not found at path: \(raw)")
    }
}
