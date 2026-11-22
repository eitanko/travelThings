export type AppErrorCode =
  | 'STORAGE_FULL'
  | 'READ_FAILED'
  | 'WRITE_FAILED'
  | 'UNSUPPORTED_FORMAT'
  | 'PERMISSION_DENIED'
  | 'FILE_MISSING'
  | 'FILE_CORRUPTED'
  | 'DATABASE_FAILED'
  | 'UNKNOWN';

const MESSAGES: Record<AppErrorCode, { title: string; message: string; retryable: boolean }> = {
  STORAGE_FULL: {
    title: 'Not enough storage',
    message: 'Your iPhone is almost full. Free up some space, then try again.',
    retryable: true,
  },
  READ_FAILED: {
    title: "Couldn't read the file",
    message: 'The selected file could not be opened. It may have been moved or removed.',
    retryable: true,
  },
  WRITE_FAILED: {
    title: "Couldn't save the file",
    message: 'The file could not be written to the app. Nothing was saved.',
    retryable: true,
  },
  UNSUPPORTED_FORMAT: {
    title: 'Unsupported file',
    message: 'Travel Things can save PDF files and images (JPEG, PNG, HEIC, and similar).',
    retryable: false,
  },
  PERMISSION_DENIED: {
    title: 'Permission needed',
    message: 'Allow access in Settings → Travel Things, then try again.',
    retryable: false,
  },
  FILE_MISSING: {
    title: 'File not found',
    message: 'The stored file is missing from this device and can no longer be opened.',
    retryable: false,
  },
  FILE_CORRUPTED: {
    title: 'File can’t be opened',
    message: 'The stored file appears to be damaged.',
    retryable: false,
  },
  DATABASE_FAILED: {
    title: "Couldn't update your library",
    message: 'The document list could not be updated. Nothing was saved.',
    retryable: true,
  },
  UNKNOWN: {
    title: 'Something went wrong',
    message: 'An unexpected error occurred. Nothing was saved.',
    retryable: true,
  },
};

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly title: string;
  readonly userMessage: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(code: AppErrorCode, cause?: unknown, detail?: string) {
    const m = MESSAGES[code];
    super(detail ?? m.message);
    this.name = 'AppError';
    this.code = code;
    this.title = m.title;
    this.userMessage = detail ?? m.message;
    this.retryable = m.retryable;
    this.cause = cause;
  }
}

const NO_SPACE = /ENOSPC|no space left|not enough (free )?space|disk full|insufficient (disk|storage)|NSFileWriteOutOfSpaceError|SQLITE_FULL/i;
const PERMISSION = /permission|not authori[sz]ed|denied|EACCES|EPERM/i;
const MISSING = /ENOENT|no such file|does not exist|not found|couldn.?t be opened because there is no such file/i;

/** Normalizes any thrown value into an AppError. `fallback` is used when nothing more specific can be inferred. */
export function toAppError(e: unknown, fallback: AppErrorCode = 'UNKNOWN'): AppError {
  if (e instanceof AppError) return e;
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  if (NO_SPACE.test(text)) return new AppError('STORAGE_FULL', e);
  if (PERMISSION.test(text)) return new AppError('PERMISSION_DENIED', e);
  if (MISSING.test(text) && fallback === 'READ_FAILED') return new AppError('FILE_MISSING', e);
  return new AppError(fallback, e);
}

/** Thrown when the user cancels a picker/scanner. Never shown as an error. */
export class CanceledError extends Error {
  constructor() {
    super('Canceled');
    this.name = 'CanceledError';
  }
}
