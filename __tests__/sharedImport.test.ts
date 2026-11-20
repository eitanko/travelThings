import { parseManifest } from '@/domain/sharedImport';

const ok = { id: 'a', createdAt: 1, state: 'ready', files: [{ name: 'x.pdf', mimeType: 'application/pdf', path: '0-x.pdf' }] };

describe('parseManifest', () => {
  it('accepts a ready manifest', () => expect(parseManifest(JSON.stringify(ok))?.files).toHaveLength(1));
  it('rejects bad JSON, other states, empty lists', () => {
    expect(parseManifest('{')).toBeNull();
    expect(parseManifest(JSON.stringify({ ...ok, state: 'staging' }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...ok, files: [] }))).toBeNull();
  });
  it('rejects path escapes and unsupported types', () => {
    expect(parseManifest(JSON.stringify({ ...ok, files: [{ ...ok.files[0], path: '../x' }] }))).toBeNull();
    expect(parseManifest(JSON.stringify({ ...ok, files: [{ ...ok.files[0], mimeType: 'video/mp4' }] }))).toBeNull();
  });
});
