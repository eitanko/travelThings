import SwiftUI

/// Semantic colors. Each resolves per appearance, so the extension follows the system light/dark setting live.
/// Values mirror src/theme/index.ts in the app.
enum TT {
  private static func dynamic(light: (Double, Double, Double), dark: (Double, Double, Double)) -> Color {
    Color(UIColor { traits in
      let c = traits.userInterfaceStyle == .dark ? dark : light
      return UIColor(red: c.0 / 255, green: c.1 / 255, blue: c.2 / 255, alpha: 1)
    })
  }

  static let bg = dynamic(light: (242, 242, 247), dark: (0, 0, 0))
  /// Surface for fields and chips that sit on `bg`.
  static let card = dynamic(light: (255, 255, 255), dark: (28, 28, 30))
  static let blue = dynamic(light: (0, 122, 255), dark: (10, 132, 255))
  static let blueTint = dynamic(light: (234, 243, 255), dark: (11, 42, 74))
  static let label = dynamic(light: (17, 17, 20), dark: (242, 242, 247))
  static let secondary = dynamic(light: (142, 142, 147), dark: (152, 152, 159))
  static let placeholder = dynamic(light: (176, 176, 181), dark: (110, 110, 115))
  static let red = dynamic(light: (255, 59, 48), dark: (255, 69, 58))
}

struct ReviewView: View {
  @ObservedObject var model: ShareModel
  @State private var confirmDiscard = false
  @State private var renaming = false
  @State private var newName = ""

  var body: some View {
    NavigationStack {
      ZStack {
        TT.bg.ignoresSafeArea()
        switch model.phase {
        case .loading:
          VStack(spacing: 12) {
            ProgressView()
            Text("Preparing…").foregroundColor(TT.secondary)
          }
        case .unsupported:
          message(icon: "doc.badge.ellipsis", title: "Nothing to import", body: "Only PDF files and images can be added to TravelThings.")
        case .fatal(let text):
          message(icon: "exclamationmark.triangle", title: "Couldn’t open", body: text)
        default:
          form
        }
        if model.phase == .saved { savedOverlay }
      }
      .navigationTitle("New Document")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("Cancel") { confirmDiscard = true }
            .disabled(model.phase == .saving || model.phase == .saved)
            .accessibilityLabel("Cancel import")
        }
      }
      .confirmationDialog("Discard this document?", isPresented: $confirmDiscard, titleVisibility: .visible) {
        Button("Discard Document", role: .destructive) { model.discard() }
        Button("Keep Editing", role: .cancel) {}
      } message: {
        Text("It has not been saved yet.")
      }
      .confirmationDialog(
        "This document is already saved",
        isPresented: Binding(get: { model.duplicate != nil }, set: { if !$0 { model.duplicate = nil } }),
        titleVisibility: .visible,
        presenting: model.duplicate
      ) { dup in
        Button("Replace existing") {
          model.duplicate = nil
          model.save(intent: DuplicateIntent(kind: "replace", existingId: dup.id))
        }
        Button("Save with another name") {
          newName = "\(model.title.isEmpty ? dup.displayName : model.title) copy"
          model.duplicate = nil
          renaming = true
        }
        Button("Cancel", role: .cancel) { model.duplicate = nil }
      } message: { dup in
        Text("It matches “\(dup.displayName)” in your library.")
      }
      .alert("Save with another name", isPresented: $renaming) {
        TextField("Name", text: $newName)
        Button("Save") {
          let n = newName.trimmingCharacters(in: .whitespacesAndNewlines)
          model.save(intent: DuplicateIntent(kind: "rename", title: n.isEmpty ? "Copy" : n))
        }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text("The file is kept as is. This only changes the name shown in your library.")
      }
      .alert(
        "Couldn’t save",
        isPresented: Binding(get: { model.saveError != nil }, set: { if !$0 { model.saveError = nil } })
      ) {
        Button("Try Again") { model.save() }
        Button("Cancel", role: .cancel) {}
      } message: {
        Text(model.saveError ?? "")
      }
    }
    .tint(TT.blue)
  }

  // MARK: Pieces

  private func message(icon: String, title: String, body: String) -> some View {
    VStack(spacing: 10) {
      Image(systemName: icon).font(.system(size: 34)).foregroundColor(TT.secondary)
      Text(title).font(.headline).foregroundColor(TT.label)
      Text(body).font(.subheadline).foregroundColor(TT.secondary).multilineTextAlignment(.center)
      Button("Close") { model.discard() }.buttonStyle(.borderedProminent).padding(.top, 8)
    }
    .padding(32)
  }

  private var savedOverlay: some View {
    VStack(spacing: 10) {
      Image(systemName: "checkmark.circle.fill").font(.system(size: 52)).foregroundColor(.green)
      Text("Saved to TravelThings").font(.headline).foregroundColor(TT.label)
      Text(model.items.count > 1 ? "\(model.items.count) files added as one document." : "It will appear in \(model.tripName) next time you open the app.")
        .font(.subheadline).foregroundColor(TT.secondary).multilineTextAlignment(.center)
    }
    .padding(28)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(TT.bg)
    .accessibilityElement(children: .combine)
  }

  private var form: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        previews
        if model.items.count > 1 {
          Text("\(model.items.count) files · saved as one document with \(model.items.count) attachments")
            .font(.footnote).foregroundColor(TT.secondary).padding(.horizontal, 22).padding(.top, 8)
        }
        field("Save to") { tripRow }
        field("Title") { titleField }
        field("Type") { typeChips }
        field("Activity date") { dateRow }
        Text("Everything is optional — you can save right away and fill this in later.")
          .font(.footnote).foregroundColor(TT.secondary).padding(.horizontal, 22).padding(.top, 18).padding(.bottom, 24)
      }
    }
    .scrollDismissesKeyboard(.interactively)
    .disabled(model.phase == .saving)
    .safeAreaInset(edge: .bottom) { saveButton }
  }

  private var saveButton: some View {
    Button { model.save() } label: {
      ZStack {
        if model.phase == .saving { ProgressView().tint(.white) } else { Text("Save Document").font(.system(size: 17, weight: .semibold)) }
      }
      .frame(maxWidth: .infinity).frame(height: 54)
      .foregroundColor(.white)
      .background(RoundedRectangle(cornerRadius: 15).fill(TT.blue))
      .opacity(model.canSave || model.phase == .saving ? 1 : 0.45)
    }
    .disabled(!model.canSave)
    .accessibilityLabel("Save Document")
    .padding(.horizontal, 16).padding(.top, 12).padding(.bottom, 8)
    .background(TT.bg.opacity(0.92))
  }

  private func field<Content: View>(_ label: String, @ViewBuilder _ content: () -> Content) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(label.uppercased()).font(.system(size: 13)).tracking(0.4).foregroundColor(TT.secondary).padding(.horizontal, 4)
      content()
    }
    .padding(.horizontal, 16).padding(.top, 18)
  }

  private var previews: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(model.items) { item in PreviewCard(item: item, model: model, count: model.items.count) }
      }
      .padding(.horizontal, 16)
    }
    .padding(.top, 10)
  }

  private var tripRow: some View {
    Menu {
      ForEach(model.trips) { t in
        Button { model.tripId = t.id } label: {
          if t.id == model.tripId { Label(t.name, systemImage: "checkmark") } else { Text(t.name) }
        }
      }
    } label: {
      HStack {
        Image(systemName: "folder").foregroundColor(TT.blue)
        Text(model.tripName).foregroundColor(TT.label)
        Spacer()
        if model.trips.count > 1 { Image(systemName: "chevron.up.chevron.down").font(.footnote).foregroundColor(TT.secondary) }
      }
      .font(.system(size: 17)).padding(14).frame(minHeight: 50).background(TT.card).clipShape(RoundedRectangle(cornerRadius: 14))
    }
    .disabled(model.trips.count < 2)
    .accessibilityLabel("Save to \(model.tripName)")
  }

  private var titleField: some View {
    HStack {
      TextField(model.items.first?.name ?? "Title (optional)", text: $model.title)
        .font(.system(size: 17)).autocorrectionDisabled().submitLabel(.done)
        .accessibilityLabel("Title, optional")
      if !model.title.isEmpty {
        Button { model.title = "" } label: {
          Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundColor(.white)
            .frame(width: 26, height: 26).background(Circle().fill(Color.gray.opacity(0.4)))
        }.accessibilityLabel("Clear title")
      }
    }
    .padding(.leading, 14).padding(.trailing, 8).frame(minHeight: 50).background(TT.card).clipShape(RoundedRectangle(cornerRadius: 14))
  }

  private var typeChips: some View {
    FlowLayout(spacing: 8) {
      ForEach(DocType.allCases) { t in
        let on = model.type == t
        Button { model.type = on ? nil : t } label: {
          HStack(spacing: 7) {
            Image(systemName: t.symbol).font(.system(size: 15))
            Text(t.label).font(.system(size: 15, weight: on ? .semibold : .regular))
          }
          .foregroundColor(on ? TT.blue : TT.label)
          .padding(.vertical, 10).padding(.horizontal, 14)
          .background(Capsule().fill(on ? TT.blueTint : TT.card))
          .overlay(Capsule().stroke(on ? TT.blue : Color.clear, lineWidth: 1.5))
        }
        .accessibilityLabel(t.label)
        .accessibilityAddTraits(on ? .isSelected : [])
      }
    }
  }

  private var dateRow: some View {
    VStack(alignment: .leading, spacing: 7) {
      if let d = model.date {
        HStack {
          DatePicker("", selection: Binding(get: { d }, set: { model.date = $0 }), displayedComponents: .date)
            .labelsHidden()
          Spacer()
          Button { model.date = nil } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundColor(.white)
              .frame(width: 26, height: 26).background(Circle().fill(Color.gray.opacity(0.4)))
          }.accessibilityLabel("Remove date")
        }
        .padding(.leading, 14).padding(.trailing, 8).frame(minHeight: 50).background(TT.card).clipShape(RoundedRectangle(cornerRadius: 14))
      } else {
        Button { model.date = Date() } label: {
          Text("Add date (optional)").font(.system(size: 17)).foregroundColor(TT.placeholder)
            .frame(maxWidth: .infinity, alignment: .leading).padding(14).frame(minHeight: 50)
            .background(TT.card).clipShape(RoundedRectangle(cornerRadius: 14))
        }.accessibilityLabel("Add activity date, optional")
      }
      Text(model.date == nil ? "Optional — the day this document is needed, e.g. a flight or check-in day." : "")
        .font(.footnote).foregroundColor(TT.secondary).padding(.horizontal, 6)
    }
  }
}

struct PreviewCard: View {
  let item: ShareModel.Item
  @ObservedObject var model: ShareModel
  let count: Int

  var body: some View {
    VStack(spacing: 6) {
      ZStack(alignment: .topTrailing) {
        RoundedRectangle(cornerRadius: 16).fill(Color.white) // stays white: documents keep their own look
        content
        if count > 1 {
          Button { model.remove(item.id) } label: {
            Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundColor(.white)
              .frame(width: 26, height: 26).background(Circle().fill(Color.black.opacity(0.5)))
          }
          .padding(8).accessibilityLabel("Remove \(item.name)")
        }
      }
      .frame(width: count > 1 ? 190 : UIScreen.main.bounds.width - 32, height: 210)
      .clipShape(RoundedRectangle(cornerRadius: 16))
      Text(item.name).font(.footnote).foregroundColor(TT.secondary).lineLimit(1)
        .frame(width: count > 1 ? 190 : UIScreen.main.bounds.width - 32)
    }
  }

  @ViewBuilder private var content: some View {
    switch item.status {
    case .loading:
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    case .ready:
      if let img = item.thumbnail {
        Image(uiImage: img).resizable().scaledToFit().padding(item.isPDF ? 8 : 0).frame(maxWidth: .infinity, maxHeight: .infinity)
          .accessibilityLabel(item.isPDF ? "PDF preview of \(item.name)" : "Preview of \(item.name)")
      }
    case .failed(let text):
      VStack(spacing: 8) {
        Image(systemName: "exclamationmark.triangle.fill").foregroundColor(TT.red)
        Text(text).font(.footnote).multilineTextAlignment(.center).foregroundColor(TT.label)
        HStack {
          Button("Try Again") { model.retry(item.id) }
          Button("Remove", role: .destructive) { model.remove(item.id) }
        }.font(.footnote.weight(.semibold))
      }
      .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }
}

/// Wrapping row of chips, like the app's Type picker.
struct FlowLayout: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    layout(in: proposal.width ?? 320, subviews: subviews).size
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    let r = layout(in: bounds.width, subviews: subviews)
    for (i, p) in r.origins.enumerated() { subviews[i].place(at: CGPoint(x: bounds.minX + p.x, y: bounds.minY + p.y), proposal: .unspecified) }
  }

  private func layout(in width: CGFloat, subviews: Subviews) -> (size: CGSize, origins: [CGPoint]) {
    var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0, maxX: CGFloat = 0
    var origins: [CGPoint] = []
    for s in subviews {
      let size = s.sizeThatFits(.unspecified)
      if x > 0 && x + size.width > width { x = 0; y += rowH + spacing; rowH = 0 }
      origins.append(CGPoint(x: x, y: y))
      x += size.width + spacing
      rowH = max(rowH, size.height)
      maxX = max(maxX, x - spacing)
    }
    return (CGSize(width: maxX, height: y + rowH), origins)
  }
}
