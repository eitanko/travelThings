import UIKit
import UniformTypeIdentifiers

/// Share extension: copies the shared PDF/image files into the private App Group container and writes a manifest.
/// The main app reviews and saves them the next time it opens. Nothing is uploaded and nothing is saved as an event here.
final class ShareViewController: UIViewController {
  private let groupId = "group.com.eitankoren.travelthings"
  private let spinner = UIActivityIndicatorView(style: .large)
  private let titleLabel = UILabel()
  private let bodyLabel = UILabel()
  private let button = UIButton(type: .system)

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemGroupedBackground
    let stack = UIStackView(arrangedSubviews: [spinner, titleLabel, bodyLabel, button])
    stack.axis = .vertical
    stack.alignment = .center
    stack.spacing = 12
    stack.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(stack)
    NSLayoutConstraint.activate([
      stack.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
      stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
    ])
    titleLabel.font = .preferredFont(forTextStyle: .headline)
    titleLabel.textAlignment = .center
    titleLabel.numberOfLines = 0
    bodyLabel.font = .preferredFont(forTextStyle: .subheadline)
    bodyLabel.textColor = .secondaryLabel
    bodyLabel.textAlignment = .center
    bodyLabel.numberOfLines = 0
    button.setTitle("Done", for: .normal)
    button.titleLabel?.font = .preferredFont(forTextStyle: .headline)
    button.addTarget(self, action: #selector(done), for: .touchUpInside)
    button.isHidden = true
    titleLabel.text = "Preparing…"
    spinner.startAnimating()
    importAttachments()
  }

  @objc private func done() {
    extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
  }

  private func finish(title: String, body: String) {
    DispatchQueue.main.async {
      self.spinner.stopAnimating()
      self.titleLabel.text = title
      self.bodyLabel.text = body
      self.button.isHidden = false
    }
  }

  private struct Entry: Codable {
    let name: String
    let mimeType: String
    let path: String
  }

  private struct Manifest: Codable {
    let id: String
    let createdAt: Double
    let state: String
    let files: [Entry]
  }

  private func importAttachments() {
    guard let root = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) else {
      finish(title: "Couldn’t save", body: "TravelThings storage isn’t available. Open TravelThings once and try again.")
      return
    }
    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    let id = UUID().uuidString
    let incoming = root.appendingPathComponent("incoming", isDirectory: true)
    let staging = incoming.appendingPathComponent("\(id).staging", isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    } catch {
      finish(title: "Couldn’t save", body: "There isn’t enough storage space, or the file couldn’t be written.")
      return
    }

    let lock = NSLock()
    var entries: [(Int, Entry)] = []
    var failures = 0
    let group = DispatchGroup()

    for (index, provider) in providers.enumerated() {
      let type: UTType?
      let mime: String
      if provider.hasItemConformingToTypeIdentifier(UTType.pdf.identifier) {
        type = .pdf; mime = "application/pdf"
      } else if provider.hasItemConformingToTypeIdentifier(UTType.image.identifier) {
        type = provider.registeredTypeIdentifiers.compactMap { UTType($0) }.first { $0.conforms(to: .image) } ?? .image
        mime = type?.preferredMIMEType ?? "image/jpeg"
      } else {
        continue // links, text, video, etc. are not documents
      }
      group.enter()
      provider.loadFileRepresentation(forTypeIdentifier: type!.identifier) { url, _ in
        defer { group.leave() }
        guard let url = url else { lock.lock(); failures += 1; lock.unlock(); return }
        // The provided URL is only valid inside this callback, so copy it right away.
        var name = provider.suggestedName ?? url.deletingPathExtension().lastPathComponent
        let ext = url.pathExtension
        if !ext.isEmpty && !name.lowercased().hasSuffix(".\(ext.lowercased())") { name += ".\(ext)" }
        name = name.replacingOccurrences(of: "/", with: "-")
        let relative = "\(index)-\(name)"
        do {
          try FileManager.default.copyItem(at: url, to: staging.appendingPathComponent(relative))
          lock.lock(); entries.append((index, Entry(name: name, mimeType: mime, path: relative))); lock.unlock()
        } catch {
          lock.lock(); failures += 1; lock.unlock()
        }
      }
    }

    group.notify(queue: .global()) {
      let files = entries.sorted { $0.0 < $1.0 }.map { $0.1 }
      guard !files.isEmpty, failures == 0 else {
        try? FileManager.default.removeItem(at: staging)
        self.finish(
          title: "Couldn’t import",
          body: files.isEmpty && failures == 0
            ? "Only PDF and image files can be added to TravelThings."
            : "Some files couldn’t be read. Nothing was added. Try again."
        )
        return
      }
      do {
        let manifest = Manifest(id: id, createdAt: Date().timeIntervalSince1970, state: "ready", files: files)
        try JSONEncoder().encode(manifest).write(to: staging.appendingPathComponent("manifest.json"), options: .atomic)
        // Renaming last makes the import visible to the app only once it is complete.
        try FileManager.default.moveItem(at: staging, to: incoming.appendingPathComponent(id, isDirectory: true))
        self.finish(
          title: files.count == 1 ? "Ready to import" : "\(files.count) files ready to import",
          body: "Open TravelThings to review and save. Nothing is saved to your library until you do."
        )
      } catch {
        try? FileManager.default.removeItem(at: staging)
        self.finish(title: "Couldn’t save", body: "The files couldn’t be stored. Try again.")
      }
    }
  }
}
