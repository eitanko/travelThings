import React, { type ReactNode } from 'react';
import { PdfUnavailableCard } from './PdfUnavailableCard';

/** Web stub: TravelThings is iOS-only. `react-native-pdf` is native-only and must never be imported on web. */
export const isNativePdfAvailable = false;

export function PdfUnavailable({ message }: { message?: string }) {
  return <PdfUnavailableCard message={message} />;
}

export function NativePdf({ fallback }: { fallback?: ReactNode } & Record<string, unknown>) {
  return <>{fallback ?? <PdfUnavailableCard />}</>;
}
