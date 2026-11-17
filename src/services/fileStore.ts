import { Directory, File, Paths } from 'expo-file-system';
import { AppError, toAppError } from '@/domain/errors';

/**
 * Permanent, app-managed storage for document files.
 * Layout: `<documentDirectory>/documents/<storageKey>/<n>-<name>`.
 * Only relative paths are persisted, because the iOS app container path can change.
 */
export interface FileStore {
  availableSpace(): number;
  size(uri: string): number;
  sha256(uri: string): Promise<string>;
  /** Copies `sourceUri` into `<storageKey>/<fileName>` and returns the relative path. */
  copyInto(sourceUri: string, storageKey: string, fileName: string): Promise<string>;
  exists(relativePath: string): boolean;
  sizeOfStored(relativePath: string): number;
  sha256OfStored(relativePath: string): Promise<string>;
  uriFor(relativePath: string): string;
  removeDir(storageKey: string): void;
  /** Removes a single stored file. Missing files are not an error. */
  removeFile(relativePath: string): void;
  listStorageKeys(): string[];
}

const ROOT = 'documents';

export class ExpoFileStore implements FileStore {
  private root(): Directory {
    const dir = new Directory(Paths.document, ROOT);
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    return dir;
  }

  availableSpace(): number {
    try {
      return Paths.availableDiskSpace;
    } catch {
      return Number.POSITIVE_INFINITY;
    }
  }

  size(uri: string): number {
    try {
      const f = new File(uri);
      if (!f.exists) throw new AppError('FILE_MISSING');
      return f.size;
    } catch (e) {
      throw toAppError(e, 'READ_FAILED');
    }
  }

  async sha256(uri: string): Promise<string> {
    try {
      return (await new File(uri).digest('SHA-256')).toLowerCase();
    } catch (e) {
      throw toAppError(e, 'READ_FAILED');
    }
  }

  async copyInto(sourceUri: string, storageKey: string, fileName: string): Promise<string> {
    try {
      const dir = new Directory(this.root(), storageKey);
      dir.create({ intermediates: true, idempotent: true });
      const dest = new File(dir, fileName);
      await new File(sourceUri).copy(dest);
      return `${ROOT}/${storageKey}/${fileName}`;
    } catch (e) {
      throw toAppError(e, 'WRITE_FAILED');
    }
  }

  private fileFor(relativePath: string): File {
    return new File(Paths.document, relativePath);
  }

  exists(relativePath: string): boolean {
    try {
      return this.fileFor(relativePath).exists;
    } catch {
      return false;
    }
  }

  sizeOfStored(relativePath: string): number {
    return this.fileFor(relativePath).size;
  }

  async sha256OfStored(relativePath: string): Promise<string> {
    return (await this.fileFor(relativePath).digest('SHA-256')).toLowerCase();
  }

  uriFor(relativePath: string): string {
    return this.fileFor(relativePath).uri;
  }

  removeDir(storageKey: string): void {
    const dir = new Directory(Paths.document, ROOT, storageKey);
    if (dir.exists) dir.delete();
  }

  removeFile(relativePath: string): void {
    const file = this.fileFor(relativePath);
    if (file.exists) file.delete();
  }

  listStorageKeys(): string[] {
    return this.root()
      .list()
      .filter((e): e is Directory => e instanceof Directory)
      .map((d) => d.name);
  }
}
