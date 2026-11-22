import ImageIO
import PDFKit
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class ShareModel: ObservableObject {
  enum Phase: Equatable { case loading, review, saving, saved, unsupported, fatal(String) }
  enum ItemStatus: Equatable { case loading, ready, failed(String) }

  struct Item: Identifiable {
    let id = UUID()
    let provider: NSItemProvider
    var name: String
    var mimeType: String
    var file: URL?
    var size: Int64 = 0
    var thumbnail: UIImage?
    var isPDF: Bool
    var status: ItemStatus = .loading
  }

  @Published var phase: Phase = .loading
  @Published var items: [Item] = []
  @Published var title = ""
  /// Nil until the user picks one; saving then falls back to Other / General file in the app.
  @Published var category: DocCategory? = nil
  @Published var type: DocType? = nil
  /// One optional date. Which field it fills depends on the category at save time, so switching category keeps it.
  @Published var date: Date? = nil
  @Published var tripId = Shared.defaultTripId
  @Published var saveError: String? = nil
  @Published var duplicate: SnapshotDoc? = nil

  let snapshot: ShareSnapshot
  private let root: URL?
  /// Doubles as the import id, so a repeated Save publishes the same package instead of a second one.
  private let importId = UUID().uuidString.lowercased()
  private var draft: URL? { root.map { Draft.draftsDir($0).appendingPathComponent(importId, isDirectory: true) } }

  var onFinish: (() -> Void)?
  var onCancel: (() -> Void)?

  init() {
    root = Shared.root()
    snapshot = ShareSnapshot.load(root: Shared.root())
  }

  /// Category chosen, or the default shown before any choice (drives the date label).
  var effectiveCategory: DocCategory { category ?? Classification.defaultCategory }

  func select(category c: DocCategory) {
    if category == c { return }
    category = c
    if let t = type, t.category != c { type = nil } // a type from another category can't stay; the date is kept
  }

  func select(type t: DocType) {
    type = (type == t) ? nil : t
    if type != nil { category = t.category }
  }

  var trips: [SnapshotTrip] { snapshot.trips }
  var tripName: String { trips.first { $0.id == tripId }?.name ?? "My Documents" }
  var canSave: Bool {
    phase == .review && !items.isEmpty && items.allSatisfy { $0.status == .ready }
  }

  // MARK: Loading

  func start(providers: [NSItemProvider]) {
    guard let root = root, let draft = draft else {
      phase = .fatal(ShareError.storageUnavailable.message)
      return
    }
    Draft.sweepStaleDrafts(root: root)
    do {
      try FileManager.default.createDirectory(at: draft, withIntermediateDirectories: true)
    } catch {
      phase = .fatal(ShareError.storageFull.message)
      return
    }
    for p in providers {
      let isPDF = p.hasItemConformingToTypeIdentifier(UTType.pdf.identifier)
      let isImage = p.hasItemConformingToTypeIdentifier(UTType.image.identifier)
      guard isPDF || isImage else { continue } // links, text, video… are not documents
      let imageType = p.registeredTypeIdentifiers.compactMap { UTType($0) }.first { $0.conforms(to: .image) }
      let mime = isPDF ? "application/pdf" : (imageType?.preferredMIMEType ?? "image/jpeg")
      items.append(Item(provider: p, name: p.suggestedName ?? (isPDF ? "Document" : "Photo"), mimeType: mime, isPDF: isPDF))
    }
    if items.isEmpty {
      phase = .unsupported
      return
    }
    for item in items { load(item.id) }
  }

  func retry(_ id: UUID) {
    update(id) { $0.status = .loading }
    load(id)
  }

  func remove(_ id: UUID) {
    if let f = items.first(where: { $0.id == id })?.file { try? FileManager.default.removeItem(at: f) }
    items.removeAll { $0.id == id }
    if items.isEmpty { phase = .unsupported }
  }

  private func update(_ id: UUID, _ change: (inout Item) -> Void) {
    guard let i = items.firstIndex(where: { $0.id == id }) else { return }
    change(&items[i])
  }

  /// Copies the provider's file into the draft while the provided URL is still valid, then validates and previews it.
  private func load(_ id: UUID) {
    guard let item = items.first(where: { $0.id == id }), let draft = draft else { return }
    let typeId = item.isPDF ? UTType.pdf.identifier
      : (item.provider.registeredTypeIdentifiers.first { UTType($0)?.conforms(to: .image) == true } ?? UTType.image.identifier)
    let suggested = item.provider.suggestedName
    let isPDF = item.isPDF
    item.provider.loadFileRepresentation(forTypeIdentifier: typeId) { [weak self] url, _ in
      var result: Result<(URL, String, Int64), ShareError>
      if let url = url {
        var name = suggested ?? url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        if !ext.isEmpty && !name.lowercased().hasSuffix(".\(ext.lowercased())") { name += ".\(ext)" }
        let dest = draft.appendingPathComponent("\(UUID().uuidString).\(ext.isEmpty ? (isPDF ? "pdf" : "img") : ext)")
        do {
          try FileManager.default.copyItem(at: url, to: dest) // the provided URL is only valid inside this callback
          let size = (try? dest.resourceValues(forKeys: [.fileSizeKey]).fileSize).map(Int64.init) ?? 0
          result = size > 0 ? .success((dest, name, size)) : .failure(.readFailed(name))
          if size == 0 { try? FileManager.default.removeItem(at: dest) }
        } catch {
          result = .failure(Draft.hasEnoughSpace(at: draft, needing: 0) ? .readFailed(name) : .storageFull)
        }
      } else {
        result = .failure(.readFailed(suggested ?? "This file"))
      }
      Task { @MainActor in self?.finishLoad(id, result) }
    }
  }

  private func finishLoad(_ id: UUID, _ result: Result<(URL, String, Int64), ShareError>) {
    switch result {
    case .failure(let e):
      update(id) { $0.status = .failed(e.message) }
    case .success(let (file, name, size)):
      let isPDF = items.first { $0.id == id }?.isPDF ?? false
      guard let thumb = Self.thumbnail(of: file, isPDF: isPDF) else {
        try? FileManager.default.removeItem(at: file)
        update(id) { $0.status = .failed("“\(name)” is damaged or isn’t a valid \(isPDF ? "PDF" : "image").") }
        return
      }
      update(id) {
        $0.file = file
        $0.name = name
        $0.size = size
        $0.thumbnail = thumb
        $0.status = .ready
      }
      if phase == .loading, !items.contains(where: { $0.status == .loading }) { phase = .review }
    }
    if phase == .loading, !items.contains(where: { $0.status == .loading }) { phase = .review }
  }

  /// Also validates the file: nil means unreadable or corrupt.
  nonisolated static func thumbnail(of url: URL, isPDF: Bool) -> UIImage? {
    if isPDF {
      guard let doc = PDFDocument(url: url), doc.pageCount > 0, let page = doc.page(at: 0) else { return nil }
      return page.thumbnail(of: CGSize(width: 480, height: 640), for: .mediaBox)
    }
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let opts: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: 900,
    ]
    guard let cg = CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary) else { return nil }
    return UIImage(cgImage: cg)
  }

  // MARK: Saving

  func save(intent chosen: DuplicateIntent? = nil) {
    guard canSave, let root = root, let draft = draft else { return }
    phase = .saving
    saveError = nil
    let snapshots = items
    let meta = (title: title, category: category, type: type, date: date, tripId: tripId)
    let known = snapshot.docs
    let importId = importId
    Task.detached {
      do {
        let hashes = try snapshots.map { try Draft.sha256(of: $0.file!) }
        let fingerprint = Draft.fingerprint(hashes)
        if chosen == nil, let dup = known.first(where: { $0.fingerprint == fingerprint }) {
          await MainActor.run {
            self.duplicate = dup
            self.phase = .review
          }
          return
        }
        let total = snapshots.reduce(Int64(0)) { $0 + $1.size }
        guard Draft.hasEnoughSpace(at: root, needing: total) else { throw ShareError.storageFull }

        // Final names keep the shared order: 0-name, 1-name…
        var files: [PackageFile] = []
        var moved: [UUID: URL] = [:]
        for (i, item) in snapshots.enumerated() {
          let rel = "\(i)-\(Draft.safeName(item.name, fallback: "file-\(i + 1)"))"
          let dest = draft.appendingPathComponent(rel)
          if item.file! != dest {
            if FileManager.default.fileExists(atPath: dest.path) { try FileManager.default.removeItem(at: dest) }
            try FileManager.default.moveItem(at: item.file!, to: dest)
          }
          moved[item.id] = dest
          files.append(PackageFile(name: item.name, mimeType: item.mimeType, path: rel, size: item.size))
        }
        let expiry = (meta.type?.category ?? meta.category)?.usesExpirationDate ?? false
        let isoDate = meta.date.map(Self.isoDay)
        let trimmed = meta.title.trimmingCharacters(in: .whitespacesAndNewlines)
        let package = SharePackage(
          schemaVersion: Shared.schemaVersion,
          importId: importId,
          createdAt: (Date().timeIntervalSince1970 * 1000).rounded(),
          tripId: meta.tripId,
          title: trimmed.isEmpty ? nil : String(trimmed.prefix(Shared.maxTitleLength)),
          category: (meta.type?.category ?? meta.category)?.rawValue,
          type: meta.type?.rawValue,
          activityDate: expiry ? nil : isoDate,
          expirationDate: expiry ? isoDate : nil,
          duplicate: chosen ?? .new,
          files: files
        )
        let movedNow = moved
        await MainActor.run {
          for i in self.items.indices { if let u = movedNow[self.items[i].id] { self.items[i].file = u } }
        }
        try Draft.publish(draft: draft, package: package, root: root)
        await MainActor.run { self.didSave() }
      } catch let e as ShareError {
        await MainActor.run { self.failSave(e.message) }
      } catch {
        await MainActor.run { self.failSave(ShareError.writeFailed.message) }
      }
    }
  }

  private func failSave(_ message: String) {
    saveError = message
    phase = .review // stays open: retry or cancel, never a success message
  }

  private func didSave() {
    phase = .saved
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) { [weak self] in self?.onFinish?() }
  }

  nonisolated static func isoDay(_ d: Date) -> String {
    let c = Calendar.current.dateComponents([.year, .month, .day], from: d)
    return String(format: "%04d-%02d-%02d", c.year ?? 1970, c.month ?? 1, c.day ?? 1)
  }

  // MARK: Cancelling

  func discard() {
    if let draft = draft { try? FileManager.default.removeItem(at: draft) } // never touches saved packages or source files
    onCancel?()
  }
}
