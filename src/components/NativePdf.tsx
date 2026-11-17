import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { Component, type ComponentProps, type ReactNode } from 'react';
import type PdfView from 'react-native-pdf';
import { PdfUnavailableCard } from './PdfUnavailableCard';

/**
 * Isolates the native PDF integration (react-native-pdf → iOS PDFKit) behind one component.
 * It needs native code, so it is unavailable in Expo Go. Everything else in the app still works there; PDFs show a
 * clear "needs a development build" card instead of crashing. Rendering errors fall back to the same card.
 */
type PdfProps = ComponentProps<typeof PdfView>;

function loadPdf(): typeof PdfView | null {
  try {
    // Expo Go has no react-native-pdf / react-native-blob-util native modules.
    if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('react-native-pdf') as { default: typeof PdfView }).default;
  } catch {
    return null;
  }
}

/** Resolved once; null when the native PDF view is not part of this binary. */
const PdfImpl = loadPdf();
export const isNativePdfAvailable = PdfImpl !== null;

interface Props extends PdfProps {
  /** Rendered instead of the PDF when the native view is unavailable or fails to render. */
  fallback?: ReactNode;
}

export function NativePdf({ fallback, ...pdfProps }: Props) {
  const card = fallback ?? <PdfUnavailable />;
  if (!PdfImpl) return <>{card}</>;
  return (
    <Boundary fallback={card} onFail={pdfProps.onError as ((e: unknown) => void) | undefined}>
      <PdfImpl {...pdfProps} />
    </Boundary>
  );
}

export function PdfUnavailable({ message }: { message?: string }) {
  return <PdfUnavailableCard message={message} />;
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode; onFail?: (e: unknown) => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    this.props.onFail?.(error);
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

