import SwiftUI
import UIKit

/// Share extension entry point. Hosts the SwiftUI review; Save publishes a durable package for the main app.
final class ShareViewController: UIViewController {
  private let model = ShareModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    isModalInPresentation = true // a swipe must not silently discard a review
    model.onFinish = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil) }
    model.onCancel = { [weak self] in
      self?.extensionContext?.cancelRequest(withError: NSError(domain: NSCocoaErrorDomain, code: NSUserCancelledError))
    }
    let host = UIHostingController(rootView: ReviewView(model: model))
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)

    let providers = (extensionContext?.inputItems as? [NSExtensionItem] ?? []).flatMap { $0.attachments ?? [] }
    model.start(providers: providers)
  }
}
