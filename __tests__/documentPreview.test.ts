/** @jest-environment node */
import { AppError } from '@/domain/errors';

const mockPreview = jest.fn((_files: unknown[], _options: unknown): Promise<void> => Promise.resolve());
const mockCanPreview = jest.fn((_files: unknown[]): Promise<boolean> => Promise.resolve(true));
const mockFileExists = new Map<string, boolean>();

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    get exists() {
      return mockFileExists.get(this.uri) ?? true;
    }
    static canPreview(files: unknown[]) {
      return mockCanPreview(files);
    }
    static preview(files: unknown[], options: unknown) {
      return mockPreview(files, options);
    }
  },
}));

// Imported after the mock so the module binds to the mocked expo-file-system.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { presentQuickLook, openPreview } = require('@/services/documentPreview') as typeof import('@/services/documentPreview');

beforeEach(() => {
  mockPreview.mockClear();
  mockCanPreview.mockReset().mockImplementation(() => Promise.resolve(true));
  mockFileExists.clear();
});

describe('presentQuickLook', () => {
  it('presents every file of the entry in order, starting at the tapped one, and reports shown', async () => {
    const uris = ['file:///app/documents/a/1-ticket.pdf', 'file:///app/documents/a/2-passenger.png'];
    expect(await presentQuickLook(uris, 1)).toBe('shown');
    expect(mockPreview).toHaveBeenCalledTimes(1);
    const [files, options] = mockPreview.mock.calls[0] as unknown as [{ uri: string }[], { initialIndex: number }];
    expect(files.map((f) => f.uri)).toEqual(uris);
    expect(options).toEqual({ initialIndex: 1 });
  });

  it('reports unsupported (so the in-app viewer is used) when Quick Look cannot show the files', async () => {
    mockCanPreview.mockImplementation(() => Promise.resolve(false));
    expect(await presentQuickLook(['file:///a.pdf'], 0)).toBe('unsupported');
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('throws FILE_MISSING without presenting anything when a stored file is gone', async () => {
    mockFileExists.set('file:///app/documents/a/1-ticket.pdf', false);
    const attempt = presentQuickLook(['file:///app/documents/a/1-ticket.pdf', 'file:///app/documents/a/2.png'], 0);
    await expect(attempt).rejects.toBeInstanceOf(AppError);
    await expect(attempt).rejects.toMatchObject({ code: 'FILE_MISSING' });
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it('throws FILE_MISSING for an empty entry', async () => {
    await expect(presentQuickLook([], 0)).rejects.toMatchObject({ code: 'FILE_MISSING' });
  });
});

describe('openPreview', () => {
  it('calls the fallback only when Quick Look is unavailable', async () => {
    const fallback = jest.fn();
    await openPreview(['file:///a.pdf'], 0, fallback);
    expect(fallback).not.toHaveBeenCalled();
    mockCanPreview.mockImplementation(() => Promise.resolve(false));
    await openPreview(['file:///a.pdf'], 0, fallback);
    expect(fallback).toHaveBeenCalledTimes(1);
  });
});
