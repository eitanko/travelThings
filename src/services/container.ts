import * as Crypto from 'expo-crypto';
import { DocumentRepository } from '@/db/repository';
import { openDatabase } from '@/db/expoDb';
import { DocumentService } from './documentService';
import { ExpoFileStore } from './fileStore';

let instance: Promise<DocumentService> | null = null;
let ready: DocumentService | null = null;

/**
 * Synchronous accessor for screens rendered after the root layout has finished initialising the library
 * (the root layout does not render any route until getDocumentService() has resolved).
 */
export function getReadyDocumentService(): DocumentService {
  if (!ready) throw new Error('Document service used before initialisation.');
  return ready;
}

/** Lazily opens the database, migrates it, sweeps orphaned files, and returns the single service instance. */
export function getDocumentService(): Promise<DocumentService> {
  if (!instance) {
    instance = (async () => {
      const db = await openDatabase();
      const service = new DocumentService({
        repo: new DocumentRepository(db),
        files: new ExpoFileStore(),
        newId: () => Crypto.randomUUID(),
        now: () => Date.now(),
      });
      try {
        await service.sweepOrphans();
      } catch {
        /* non-fatal */
      }
      ready = service;
      return service;
    })().catch((e) => {
      instance = null; // allow retry
      throw e;
    });
  }
  return instance;
}
