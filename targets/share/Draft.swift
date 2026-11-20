import CryptoKit
import Foundation

/// File-system side of the extension: drafts, hashing and the atomic package publish. Foundation only.
enum Draft {
  static func draftsDir(_ root: URL) -> URL { root.appendingPathComponent("drafts", isDirectory: true) }
  static func inboxDir(_ root: URL) -> URL { root.appendingPathComponent("inbox", isDirectory: true) }

  /// Drafts older than a day are abandoned (the extension was killed mid-review). Committed packages are never touched.
  static func sweepStaleDrafts(root: URL, olderThan age: TimeInterval = 24 * 3600, now: Date = Date()) {
    let fm = FileManager.default
    guard let items = try? fm.contentsOfDirectory(at: draftsDir(root), includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
    for url in items {
      let modified = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? now
      if now.timeIntervalSince(modified) > age { try? fm.removeItem(at: url) }
    }
  }

  static func sha256(of url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hasher = SHA256()
    while let chunk = try handle.read(upToCount: 1 << 20), !chunk.isEmpty { hasher.update(data: chunk) }
    return hasher.finalize().map { String(format: "%02x", $0) }.joined()
  }

  /// Same rule as fingerprintInput() in the app: one file → its hash; several → sorted hashes joined by ":".
  static func fingerprint(_ hashes: [String]) -> String {
    hashes.count == 1 ? hashes[0] : hashes.sorted().joined(separator: ":")
  }

  /// Same rule as safeFileName() in the app.
  static func safeName(_ name: String, fallback: String) -> String {
    let bad = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
    var cleaned = name.components(separatedBy: bad).joined(separator: "_")
    while cleaned.hasPrefix(".") { cleaned.removeFirst() }
    cleaned = cleaned.trimmingCharacters(in: .whitespaces)
    return String((cleaned.isEmpty ? fallback : cleaned).prefix(120))
  }

  static func hasEnoughSpace(at url: URL, needing bytes: Int64) -> Bool {
    guard let values = try? url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]),
          let free = values.volumeAvailableCapacityForImportantUsage else { return true }
    return free >= bytes + Shared.spaceMargin
  }

  /// Writes package.json into the draft directory, then publishes the whole directory with one rename.
  /// The app only ever sees `inbox/<importId>` once it is complete. Calling this again for an already published
  /// import is a success, so a repeated Save can never create a second package.
  static func publish(draft: URL, package: SharePackage, root: URL) throws {
    let fm = FileManager.default
    let inbox = inboxDir(root)
    let destination = inbox.appendingPathComponent(package.importId, isDirectory: true)
    if fm.fileExists(atPath: destination.appendingPathComponent("package.json").path) { return }
    try fm.createDirectory(at: inbox, withIntermediateDirectories: true)
    let encoder = JSONEncoder()
    let data = try encoder.encode(package)
    try data.write(to: draft.appendingPathComponent("package.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    try fm.moveItem(at: draft, to: destination)
  }
}
