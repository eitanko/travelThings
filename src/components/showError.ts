import type { SheetConfig } from './ActionSheet';
import { toAppError } from '@/domain/errors';

/** Builds an error sheet with understandable text and Retry / Cancel (Retry only when it can help). */
export function errorSheet(e: unknown, onRetry?: () => void): SheetConfig {
  const err = toAppError(e);
  return {
    title: err.title,
    message: err.userMessage,
    actions: err.retryable && onRetry ? [{ label: 'Retry', onPress: onRetry }] : [],
    cancelLabel: err.retryable && onRetry ? 'Cancel' : 'OK',
  };
}
