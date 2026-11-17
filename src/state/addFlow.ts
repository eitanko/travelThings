import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import type { SheetConfig } from '@/components/ActionSheet';
import { errorSheet } from '@/components/showError';
import { CanceledError } from '@/domain/errors';
import { normalizeStaged } from '@/domain/validation';
import { pickFiles, type ImportSource } from '@/services/importer';
import { importSession } from './store';

/**
 * Opens the native source, validates the selection and stages it.
 * Cancel → nothing happens. Failure → error sheet with Retry/Cancel. No record is created at this stage.
 */
async function runImport(source: ImportSource, onStaged: () => void, showSheet: (c: SheetConfig) => void): Promise<void> {
  try {
    const files = normalizeStaged(await pickFiles(source));
    importSession.set(files);
    onStaged();
  } catch (e) {
    if (e instanceof CanceledError) return;
    showSheet(errorSheet(e, () => void runImport(source, onStaged, showSheet)));
  }
}

/**
 * Add Document flow: native source → New Document screen.
 * With `targetDocumentId`, the same native sources stage files for "Add another document" → /add/[id] instead.
 */
export function useAddFlow(showSheet: (c: SheetConfig) => void, targetDocumentId?: string) {
  const router = useRouter();

  const start = useCallback(
    (source: ImportSource) =>
      runImport(
        source,
        () =>
          router.push(
            targetDocumentId ? { pathname: '/add/[id]', params: { id: targetDocumentId } } : '/new',
          ),
        showSheet,
      ),
    [router, showSheet, targetDocumentId],
  );

  const openAddSheet = useCallback(() => {
    showSheet({
      actions: [
        { label: 'Documents', sub: 'PDF or other file', icon: 'folder', onPress: () => void start('documents') },
        { label: 'Images', sub: 'Choose one or more photos', icon: 'image', onPress: () => void start('images') },
        { label: 'Scan', sub: 'Scan a paper document', icon: 'scan', onPress: () => void start('scan') },
        { label: 'Camera', sub: 'Take a photo of a document', icon: 'camera', onPress: () => void start('camera') },
      ],
    });
  }, [showSheet, start]);

  return { openAddSheet };
}
