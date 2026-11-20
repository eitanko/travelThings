import { DEFAULT_TRIP_ID } from '@/domain/trips';
import { SNAPSHOT_SCHEMA_VERSION, parsePackage, type ShareSnapshot } from '@/domain/sharePackage';
import type { StagedFile } from '@/domain/types';
import type { CommitMode, DocumentService } from './documentService';

/** A committed package in the App Group inbox. Implemented over expo-file-system in the app and over node:fs in tests. */
export interface InboxPackage {
  importId: string;
  readManifest(): Promise<string>;
  fileUri(name: string): string;
  fileSize(name: string): number | null;
}
export interface InboxStore {
  /** Committed packages only. Half-written drafts are never listed. */
  list(): InboxPackage[];
  remove(importId: string): void;
}

export interface IngestResult {
  incorporated: number;
  failed: number;
  /** Packages whose chosen trip no longer existed, so they went to My Documents. */
  fellBackToDefault: number;
  lastDocumentId: string | null;
}

/**
 * Turns every committed package from the Share extension into a normal event, through the same prepare/commit
 * path as an in-app import. Safe to run repeatedly and after a crash at any point:
 *  - the import id is recorded in the same transaction as the event, so a package is never incorporated twice;
 *  - the package is removed only after that commit, and a leftover package of a processed import is just removed;
 *  - a failed package is kept untouched and retried on the next run.
 * It never overwrites silently: Replace is honoured only while the intended document still has identical content.
 */
export async function ingestPackages(svc: DocumentService, inbox: InboxStore): Promise<IngestResult> {
  const result: IngestResult = { incorporated: 0, failed: 0, fellBackToDefault: 0, lastDocumentId: null };
  const packages = inbox.list();
  const parsed: { pkg: InboxPackage; manifest: NonNullable<ReturnType<typeof parsePackage>> }[] = [];

  for (const pkg of packages) {
    try {
      if (await svc.isImportProcessed(pkg.importId)) {
        inbox.remove(pkg.importId); // crash happened between commit and cleanup
        continue;
      }
      const manifest = parsePackage(await pkg.readManifest());
      if (!manifest || manifest.importId !== pkg.importId) throw new Error('invalid package');
      parsed.push({ pkg, manifest });
    } catch {
      result.failed++;
    }
  }
  parsed.sort((a, b) => a.manifest.createdAt - b.manifest.createdAt);

  for (const { pkg, manifest } of parsed) {
    try {
      const staged: StagedFile[] = manifest.files.map((f) => {
        if (pkg.fileSize(f.path) !== f.size) throw new Error('file missing or incomplete');
        return { uri: pkg.fileUri(f.path), name: f.name, mimeType: f.mimeType, size: f.size };
      });
      const prepared = await svc.prepare(staged);

      const trips = await svc.listTrips();
      const tripExists = trips.some((t) => t.id === manifest.tripId);
      const tripId = tripExists ? manifest.tripId : DEFAULT_TRIP_ID;

      let mode: CommitMode = { kind: 'new' };
      const intent = manifest.duplicate;
      if (intent.kind === 'rename') mode = { kind: 'rename', title: intent.title };
      else if (intent.kind === 'replace' && prepared.duplicate?.id === intent.existingId) mode = { kind: 'replace', existingId: intent.existingId };
      // A replace whose target is gone or changed falls back to a new event: nothing is overwritten, nothing is lost.

      const doc = await svc.commit(
        prepared,
        { title: manifest.title, type: manifest.type, activityDate: manifest.activityDate },
        mode,
        tripId,
        manifest.importId,
      );
      result.incorporated++;
      if (!tripExists) result.fellBackToDefault++;
      result.lastDocumentId = doc.id;
      inbox.remove(manifest.importId);
    } catch {
      result.failed++; // kept for the next automatic retry
    }
  }
  return result;
}

/** Minimal read-only view of the library for the extension: trip choices and duplicate detection. */
export async function buildSnapshot(svc: DocumentService, now: number): Promise<ShareSnapshot> {
  const [trips, docs] = await Promise.all([svc.listTrips(), svc.list()]);
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    updatedAt: now,
    trips: trips.map((t) => ({ id: t.id, name: t.name, isDefault: t.isDefault })),
    docs: docs.map((d) => ({ id: d.id, title: d.title, originalName: d.originalName, fingerprint: d.fingerprint })),
  };
}
