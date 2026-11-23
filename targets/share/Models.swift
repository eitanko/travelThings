import Foundation

/// Contract with the main app. Keep in step with src/domain/sharePackage.ts.
enum Shared {
  static let groupId = "group.com.eitankoren.travelthings"
  static let schemaVersion = 1
  static let defaultTripId = "default-my-documents"
  static let maxTitleLength = 200
  /// Same margin the app requires beyond the file bytes.
  static let spaceMargin: Int64 = 5 * 1024 * 1024

  static func root() -> URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId)
  }
}

struct SnapshotTrip: Codable, Identifiable, Hashable {
  let id: String
  let name: String
  let isDefault: Bool
}

struct SnapshotDoc: Codable {
  let id: String
  let title: String?
  let originalName: String
  let fingerprint: String
  var displayName: String {
    let t = title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    return t.isEmpty ? originalName : t
  }
}

/// Written by the main app. Read-only here; a missing or unreadable snapshot just means "My Documents, no duplicate check".
struct ShareSnapshot: Codable {
  let schemaVersion: Int
  let trips: [SnapshotTrip]
  let docs: [SnapshotDoc]

  static let fallback = ShareSnapshot(
    schemaVersion: 1,
    trips: [SnapshotTrip(id: Shared.defaultTripId, name: "My Documents", isDefault: true)],
    docs: []
  )

  static func load(root: URL?) -> ShareSnapshot {
    guard let root = root,
          let data = try? Data(contentsOf: root.appendingPathComponent("snapshot.json")),
          let snap = try? JSONDecoder().decode(ShareSnapshot.self, from: data),
          snap.schemaVersion == 1,
          !snap.trips.isEmpty
    else { return .fallback }
    return snap
  }
}

struct PackageFile: Codable {
  let name: String
  let mimeType: String
  let path: String
  let size: Int64
}

struct DuplicateIntent: Codable, Equatable {
  let kind: String          // "new" | "replace" | "rename"
  var existingId: String? = nil
  var title: String? = nil
  static let new = DuplicateIntent(kind: "new")
}

struct SharePackage: Codable {
  let schemaVersion: Int
  let importId: String
  let createdAt: Double     // milliseconds since 1970, like Date.now()
  let tripId: String
  let title: String?
  /// Category / type / dates use the keys of src/domain/classification.ts (see Classification.swift, generated).
  let category: String?
  let type: String?
  let activityDate: String?
  let expirationDate: String?
  let duplicate: DuplicateIntent
  let files: [PackageFile]
}

enum ShareError: Error, Equatable {
  case storageUnavailable
  case storageFull
  case readFailed(String)
  case writeFailed

  var message: String {
    switch self {
    case .storageUnavailable: return "Travel Things storage isn’t available. Open Travel Things once, then try again."
    case .storageFull: return "There isn’t enough free space on this iPhone to save these files."
    case .readFailed(let n): return "“\(n)” can’t be read."
    case .writeFailed: return "The files couldn’t be saved. Nothing was added."
    }
  }
}
