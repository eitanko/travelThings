# TravelThings

An offline-first travel document wallet for iOS. Save tickets, bookings, passports and visas as PDFs or images, add optional details, and find them again instantly, with no connection needed.

**Core principle: store the original file safely and make it easy to find.**

Built with React Native, Expo (SDK 58), Expo Router and TypeScript (strict). Implements **Phase 1** of the product spec (v0.6) only. See [Scope](#scope).

---

## Status at a glance

| | |
|---|---|
| Typecheck (`tsc --noEmit`, strict) | ✅ passes |
| Lint (`eslint`, incl. React Compiler rules) | ✅ 0 errors, 0 warnings |
| Automated tests (Jest) | ✅ 53 passing |
| iOS JS bundle (`expo export --platform ios`) | ✅ builds (Hermes bytecode) |
| iOS native config (`expo prebuild`) | ✅ generates; plist and entitlements inspected |
| **Run on a real iPhone / simulator** | ❌ **not done yet. See [Manual verification](#manual-verification-still-required)** |
| EAS cloud build | ❌ not run (needs your Expo + Apple accounts) |

---

## Run locally

Requirements: **Node ≥ 22.13** (the tests use Node's built-in SQLite), npm.

```bash
npm install
npm start            # Metro dev server (opens in a development build; use `npx expo start --go` for Expo Go)
npm run check        # typecheck + lint + tests
```

### Expo Go (limited, for quick UI iteration)

`npx expo start --go` (the `--go` flag is needed because `expo-dev-client` is installed and would otherwise be the default), then scan the QR code with the iPhone camera (Expo Go installed from the App Store).

| Works in Expo Go | Needs a development build |
|---|---|
| Library, search, filters, empty state | **PDF rendering / full-screen PDF viewer** (`react-native-pdf`) |
| Import from Files and Photos, Camera | **Document scanner** (`react-native-document-scanner-plugin`) |
| Preview + metadata, save, edit, delete | iOS data-protection entitlement (only applied in a real build) |
| Duplicate detection and error flows | |
| SQLite + permanent file storage, images with pinch-zoom | |

In Expo Go, PDFs show a "PDF preview unavailable" card and Scan reports that it needs a development build. The app does not crash. Use Expo Go only for the left column; **PDF zoom and scanning must be tested in a development build.**

### Development build (full functionality)

Two native modules aren't in Expo Go, so a custom development build is required to test everything:

- `react-native-pdf` (+ `react-native-blob-util`): native PDFKit viewer with pinch-zoom and multi-page scrolling
- `react-native-document-scanner-plugin`: Apple's `VNDocumentCameraViewController`

```bash
eas build --profile development --platform ios        # on a physical device (needs an Apple Developer account)
eas build --profile development-simulator --platform ios   # for the iOS Simulator (no Apple account needed)
npm run start:dev-client
```

(`expo run:ios` also works, but only on a Mac with Xcode. Not needed for this project.)

---

## Build in the cloud without Xcode (EAS)

### One-time setup

1. **Pick your identity.** In `app.json` change `expo.ios.bundleIdentifier` from the placeholder `com.example.travelthings` to your own reverse-DNS id, e.g. `com.yourname.travelthings`. It must be unique on the App Store.
2. Create a free Expo account, then:
   ```bash
   npm install -g eas-cli
   eas login
   eas init                 # creates the EAS project and writes extra.eas.projectId into app.json
   ```
3. `eas.json` is already configured:

   | Profile | Use |
   |---|---|
   | `development` | Dev client for a physical device (internal distribution) |
   | `development-simulator` | Dev client for the iOS Simulator |
   | `preview` | Release build for internal testers (ad hoc) |
   | `production` | App Store / TestFlight build, build number auto-incremented |

### Apple Developer account steps

A paid **Apple Developer Program** membership (US$99/year) is required for anything that runs on a physical device other than via Expo Go, and for TestFlight.

1. Enroll at <https://developer.apple.com/programs/>.
2. On your first `eas build`, sign in with your Apple ID when prompted. EAS creates and stores the distribution certificate, provisioning profile and App ID, and enables the **Data Protection** capability from the app's entitlements. You do not need Xcode or a Mac.
3. For `development` / `preview` (ad hoc) builds, register each test iPhone once: `eas device:create`.
4. For TestFlight, create the app record in **App Store Connect → My Apps → +** using the same bundle identifier.

### Produce an iOS build

```bash
eas build --profile preview --platform ios       # installable on registered devices
eas build --profile production --platform ios    # for TestFlight / App Store
```

### Distribute through TestFlight

```bash
eas build --profile production --platform ios
eas submit --profile production --platform ios   # uploads the build to App Store Connect
# or do both at once:
eas build --profile production --platform ios --auto-submit
```

Then in App Store Connect → **TestFlight**: wait for processing, answer the export-compliance prompt (already declared: `ITSAppUsesNonExemptEncryption = false`), add internal testers (immediate) or an external group (requires a brief Beta App Review).

---

## Scope

**In Phase 1:** document library (Today / Upcoming / No Date / Past, search, All/Bookings/IDs/Other filters, empty state), Add via Documents / Images / Scan / Camera, preview + optional title/type/activity date, detail, one entry with multiple attached files (+ Add another document, remove one file, swipe between files), full-screen offline viewer with zoom, edit, delete with confirmation, checksum duplicate detection (Replace existing / Save with another name / Cancel), import error handling with Retry/Cancel.

**Deliberately not built** (per spec v0.6): trips, archive, travelers, bookings/events, ticket-completeness, AI extraction, iCloud sync, sharing, subscriptions, calendar view, advanced filters, description/location/booking-reference fields, authentication, any backend or network call.

---

## How storage works (the critical part)

```
Documents (files picked/scanned/photographed)
   │  copied to the app's cache by the picker (temporary)
   ▼
prepare():  validate format → SHA-256 each file → look for a duplicate      (nothing permanent written)
   ▼
commit():   free-space check → copy into  <Documents>/documents/<storageKey>/<n>-<name>
            → re-hash the stored copy and compare size + SHA-256 to the source
            → one SQLite transaction inserts the document + attachment rows
            → on ANY failure: delete what this call wrote, throw (no record, no success toast)
```

- **Original bytes, never recompressed.** Files are copied byte-for-byte; HEIC stays HEIC. The copy is verified against the source hash before the record exists.
- **Never depends on the original URL.** Only paths *relative to the app's documents directory* are stored (the iOS container path can change between launches/updates).
- **SQLite (`expo-sqlite`) holds metadata only; the file system holds files.** Nothing is stored in AsyncStorage.
- **Success is shown only after both** the file and the metadata are stored.
- **Replace existing** copies the new files first, then swaps the rows in a single transaction, and only then removes the old files. If anything fails, the existing document is untouched.
- **Delete** removes the DB rows (cascade), then the files. A leftover directory is never visible and is swept at next launch.
- **Crash safety:** at launch, storage directories that no row references (crashed imports, failed deletes) are removed.
- **Integrity:** opening a document checks existence + size; a missing or damaged file shows a clear message and the entry can be deleted.
- **Temporary copies** left by the pickers/camera/scanner in the cache are deleted after a save or discard.
- **Schema migrations** are ordered and tracked with `PRAGMA user_version` (`src/db/migrations.ts`). Add new entries; never edit old ones.

### Security

- Files live in the app sandbox, and the app declares `com.apple.developer.default-data-protection = NSFileProtectionComplete`: files are encrypted by iOS and unreadable while the device is locked.
- File sharing and "open in place" are disabled in the Info.plist.
- No analytics, no network calls, no account. Documents never leave the device.
- No custom Face ID lock (explicitly not required in Phase 1).
- Note: iOS device backups can include app data. Backup/restore and iCloud are separate later decisions in the spec.

---

## Project layout

```
app/                      Expo Router screens
  index.tsx               Documents home (list, search, filters, FAB, empty state)
  new.tsx                 New Document: preview + optional metadata + duplicate flow
  document/[id].tsx       Detail
  edit/[id].tsx           Edit metadata
  viewer.tsx              Full-screen viewer route
src/
  domain/                 Pure TypeScript: types, grouping/search, dates, validation, errors
  db/                     Schema + migrations, repository, expo-sqlite adapter
  services/               documentService (import/commit/delete/integrity), fileStore (expo-file-system),
                          importer (pickers/camera/scanner), container (wiring)
  components/             UI: ActionSheet, Toast, DocumentRow, SegmentedControl, PreviewCarousel,
                          FullScreenViewer, ZoomableImage, NativePdf, DocumentForm, EmptyState, Icon
  state/                  Small external stores (library, staged import, boot)
  theme/                  Design tokens ported from the HTML prototype
  dev/                    Development-only sample data (real generated PDFs, stored via the normal import path)
__tests__/                Jest tests
```

`DocumentService` depends only on the `FileStore` and `Db` interfaces. Production uses `expo-file-system` and `expo-sqlite`; tests use an in-memory file store and Node's real SQLite engine, so the SQL, transactions and rollback paths are genuinely exercised.

**Sample data** (`Load sample documents`, empty state) exists only when `__DEV__` is true, and imports generated multi-page PDFs through the real import pipeline. It is absent from release builds.

---

## Testing

```bash
npm run typecheck
npm run lint
npm test
npm run check        # all three
```

### What the automated tests cover (executed: 44 tests)

Run against real SQLite and a fake file store that can inject failures:

- Import PDF and image, bytes preserved exactly; opens after the source is deleted; survives "restart" (new service instance on the same storage)
- Save with all metadata empty → shows original filename; identical filenames don't collide; multi-attachment order
- Edit metadata; **changing the activity date moves the document** between list groups; delete removes rows **and** files; empty library
- Duplicate detection by checksum (different filename, same content); **Replace** (keeps record, removes old files); **failed Replace leaves the existing file intact**; DB failure during Replace rolls back and cleans up; **Save with another name** → separate record + separate identical file; **Cancel** changes nothing
- Failed copy → no record, no files, retry succeeds; low storage refuses before writing; corrupted copy detected; DB insert failure rolls back files; failure on file 2 of 3 removes file 1; unsupported formats rejected; unreadable/empty sources; missing/corrupted stored files detected; orphan sweep never touches referenced directories
- Grouping (Today/Upcoming/No Date/Past), ordering, calendar-day (not timestamp) semantics, filters, search, validation, error classification, migrations idempotent, generated sample PDFs are structurally valid

### Manual verification still required

These involve native iOS behaviour that cannot run in this repository's automated environment. **Test them on a device build before relying on the app:**

1. Import a PDF from Files and open it offline (airplane mode).
2. Import an image from Photos; open offline.
3. Force-quit and relaunch; reboot the iPhone; documents still open.
4. Delete the original from Files/Photos; the saved copy still opens.
5. Pinch-zoom into a PDF to read small text and scan a QR/barcode; scroll a multi-page PDF; swipe between multiple images.
6. Scan (VisionKit), including multi-page scans.
7. Camera capture; deny camera permission and confirm the message appears and no record is created.
8. Duplicate import → all three choices (Replace existing, Save with another name, Cancel). `Alert.prompt` for the name is iOS-only.
9. Import with the phone nearly full → error with Retry/Cancel, no false success.
10. Confirm the `NSFileProtectionComplete` entitlement is present in the signed build and that files are unreadable while locked/first-boot.
11. Dynamic Type / VoiceOver pass over the main screens.
12. Visual comparison against `travelThings.html` (spacing, type, icons, animation timing).

### Known limitations / risks

- **`react-native-pdf` + `react-native-blob-util` + `react-native-document-scanner-plugin` are third-party native modules, linked via CocoaPods at EAS build time.** Compatibility with the current React Native / New Architecture could only be checked at the JS-bundle and config level here, not by compiling the native code. If a build fails or a view misbehaves, those are the first suspects. Both are isolated behind `NativePdf` and `importer.ts`, so one can be swapped without touching the rest.
- Images use native `UIScrollView` zoom with 2× oversampling so QR codes stay sharp. Verify on device.
- Dates are calendar days (`YYYY-MM-DD`) and never converted through time zones.
- Light appearance only (matches the prototype).

---

## Requirement traceability (Phase 1)

| ID | Requirement | Screen / module | Test |
|---|---|---|---|
| FR-01 | Save and browse without trips | `app/index.tsx`, `documentService` | AT-01 import/restart tests |
| FR-02 | Durable original copy in app storage | `fileStore`, `documentService.commit` | import & persistence, failure tests |
| FR-03 | Offline full-screen viewer, zoom, multi-page | `FullScreenViewer`, `ZoomableImage`, `NativePdf` | **device only** |
| FR-04 | Preview + optional title/type/date; filename fallback | `app/new.tsx`, `DocumentForm`, `displayTitle` | metadata-empty & display-title tests |
| FR-05 | Dated and undated documents; sort by activity date | `groupDocuments` | grouping/ordering tests |
| FR-06 | Basic search and type filters | `matchesQuery`, `matchesFilter` | filters & search tests |
| FR-11 | Success only after durable copy; errors with Retry/Cancel; duplicate choices | `documentService`, `errors`, `showError` | failure-handling & duplicate tests |
| FR-12 | Delete with confirmation; no orphaned data | `app/document/[id].tsx`, `documentService.delete` | delete tests, orphan sweep |

Acceptance tests AT-01, AT-03, AT-08, AT-09, AT-10, AT-11 are covered at the logic level by the automated suite; AT-02 (zoom, multi-page, airplane mode) and the on-device parts of AT-01/AT-08 need the manual checks above.
