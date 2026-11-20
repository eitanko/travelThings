import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { AppError, CanceledError, toAppError } from '@/domain/errors';
import type { StagedFile } from '@/domain/types';

export type ImportSource = 'documents' | 'images' | 'scan' | 'camera';

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}.${p(d.getMinutes())}.${p(d.getSeconds())}`;
};

const asFileUri = (p: string) => (p.startsWith('file://') || p.includes('://') ? p : `file://${p}`);

/**
 * Best-effort removal of the temporary copies the picker, camera and scanner leave in the app's cache/tmp folders
 * (they can hold passports and tickets). Only files inside those folders are ever touched, never permanent storage
 * and never the user's originals. Safe to call after a successful save or when the user discards the import.
 */
export function discardStagedFiles(files: StagedFile[]): void {
  const uris = new Set(files.flatMap((f) => [f.uri, f.originalUri].filter((u): u is string => !!u)));
  for (const uri of uris) removeTempFile(uri);
}

/** Deletes one temporary file, but only if it is in a cache/tmp folder and not in permanent storage. */
export function removeTempFile(uri: string): void {
  try {
    const inTemp = uri.startsWith(Paths.cache.uri) || /\/tmp\//.test(uri);
    const inPermanent = uri.startsWith(Paths.document.uri);
    if (!inTemp || inPermanent) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    /* the OS purges cache/tmp on its own */
  }
}

/**
 * Opens the native picker/scanner/camera for `source`.
 * Resolves with staged (temporary) files, or throws CanceledError when the user backs out.
 * Nothing is written to permanent storage here.
 */
export async function pickFiles(source: ImportSource): Promise<StagedFile[]> {
  switch (source) {
    case 'documents':
      return pickDocuments();
    case 'images':
      return pickImages();
    case 'camera':
      return takePhoto();
    case 'scan':
      return scan();
  }
}

async function pickDocuments(): Promise<StagedFile[]> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      multiple: true,
      copyToCacheDirectory: true,
    });
    if (res.canceled) throw new CanceledError();
    return res.assets.map((a) => ({ uri: a.uri, name: a.name, mimeType: a.mimeType ?? '', size: a.size }));
  } catch (e) {
    if (e instanceof CanceledError) throw e;
    throw toAppError(e, 'READ_FAILED');
  }
}

async function pickImages(): Promise<StagedFile[]> {
  try {
    // The iOS system photo picker needs no photo-library permission.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 0,
      allowsEditing: false,
      quality: 1,
      exif: false,
      // Keep the original representation (e.g. HEIC stays HEIC) instead of transcoding.
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    if (res.canceled) throw new CanceledError();
    return res.assets.map((a, i) => ({
      uri: a.uri,
      name: a.fileName ?? `Photo ${stamp()}${res.assets.length > 1 ? ` (${i + 1})` : ''}.jpg`,
      mimeType: a.mimeType ?? 'image/jpeg',
      size: a.fileSize,
    }));
  } catch (e) {
    if (e instanceof CanceledError) throw e;
    throw toAppError(e, 'READ_FAILED');
  }
}

async function ensureCameraPermission(): Promise<void> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new AppError(
      'PERMISSION_DENIED',
      undefined,
      'Camera access is turned off. Allow it in Settings → TravelThings → Camera, then try again.',
    );
  }
}

async function takePhoto(): Promise<StagedFile[]> {
  await ensureCameraPermission();
  try {
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
    if (res.canceled) throw new CanceledError();
    return res.assets.map((a) => ({
      uri: a.uri,
      name: a.fileName ?? `Photo ${stamp()}.jpg`,
      mimeType: a.mimeType ?? 'image/jpeg',
      size: a.fileSize,
    }));
  } catch (e) {
    if (e instanceof CanceledError) throw e;
    throw toAppError(e, 'READ_FAILED');
  }
}

interface ScannerModule {
  scanDocument(opts: Record<string, unknown>): Promise<{ scannedImages?: string[]; status?: string }>;
}

async function scan(): Promise<StagedFile[]> {
  await ensureCameraPermission();
  let scanner: ScannerModule;
  try {
    // Loaded lazily: the native module only exists in a development/production build, not in Expo Go.
    scanner = (await import('react-native-document-scanner-plugin')).default as unknown as ScannerModule;
    if (!scanner?.scanDocument) throw new Error('missing');
  } catch {
    throw new AppError(
      'UNKNOWN',
      undefined,
      'Document scanning needs a TravelThings development build. It isn’t available in Expo Go.',
    );
  }
  try {
    const res = await scanner.scanDocument({ maxNumDocuments: 24, croppedImageQuality: 100, responseType: 'imageFilePath' });
    const images = res.scannedImages ?? [];
    if (res.status === 'cancel' || images.length === 0) throw new CanceledError();
    const base = `Scan ${stamp()}`;
    return images.map((p, i) => ({
      uri: asFileUri(p),
      name: images.length > 1 ? `${base} – page ${i + 1}.jpg` : `${base}.jpg`,
      mimeType: 'image/jpeg',
    }));
  } catch (e) {
    if (e instanceof CanceledError) throw e;
    throw toAppError(e, 'READ_FAILED');
  }
}
