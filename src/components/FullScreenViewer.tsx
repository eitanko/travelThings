import React, { useCallback, useRef, useState } from 'react';
import { FlatList, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { viewer } from '@/theme';
import { NativePdf } from './NativePdf';
import type { PreviewItem } from './PreviewCarousel';
import { ZoomableImage } from './ZoomableImage';

interface Props {
  items: PreviewItem[];
  initialIndex?: number;
  onClose: () => void;
}

/**
 * Full-screen, fully offline viewer.
 * - Images: native UIScrollView pinch-zoom + pan.
 * - PDFs: native PDFKit-backed view (react-native-pdf) with pinch-zoom, pan and continuous multi-page scrolling.
 * - Swipe horizontally between attachments (disabled while a PDF is zoomed so panning isn't hijacked).
 */
export function FullScreenViewer({ items, initialIndex = 0, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [index, setIndex] = useState(Math.min(initialIndex, Math.max(0, items.length - 1)));
  const [pdfZoomed, setPdfZoomed] = useState(false);
  const [pdfPage, setPdfPage] = useState<Record<number, { page: number; total: number }>>({});
  const [errors, setErrors] = useState<Record<number, boolean>>({});
  const list = useRef<FlatList<PreviewItem>>(null);

  const onLayout = (e: LayoutChangeEvent) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (area.w > 0) {
      setIndex(Math.round(e.nativeEvent.contentOffset.x / area.w));
      setPdfZoomed(false);
    }
  };

  const markError = useCallback((i: number) => setErrors((p) => ({ ...p, [i]: true })), []);
  const current = items[index];
  const cp = pdfPage[index];

  return (
    <View style={styles.root}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close viewer" style={styles.doneBtn}>
          <Text style={styles.done}>Done</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {items.length > 1 ? `${index + 1} of ${items.length}` : current?.name ?? ''}
        </Text>
        <View style={styles.doneBtn} />
      </View>

      <View style={styles.area} onLayout={onLayout}>
        {area.w > 0 && (
          <FlatList
            ref={list}
            data={items}
            horizontal
            pagingEnabled
            scrollEnabled={!pdfZoomed}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index}
            getItemLayout={(_, i) => ({ length: area.w, offset: area.w * i, index: i })}
            keyExtractor={(it, i) => `${it.uri}-${i}`}
            windowSize={3}
            onMomentumScrollEnd={onScrollEnd}
            renderItem={({ item, index: i }) => (
              <View style={{ width: area.w, height: area.h }}>
                {errors[i] ? (
                  <View style={styles.errBox}>
                    <Text style={styles.errTitle}>This file can’t be opened</Text>
                    <Text style={styles.errMsg}>{item.name}</Text>
                  </View>
                ) : item.kind === 'image' ? (
                  <ZoomableImage uri={item.uri} width={area.w} height={area.h} onError={() => markError(i)} />
                ) : (
                  <NativePdf
                    source={{ uri: item.uri }}
                    style={{ width: area.w, height: area.h, backgroundColor: viewer.bg }}
                    minScale={1}
                    maxScale={10}
                    enableDoubleTapZoom
                    enablePaging={false}
                    horizontal={false}
                    spacing={10}
                    fitPolicy={0}
                    onLoadComplete={(total) => setPdfPage((p) => ({ ...p, [i]: { page: 1, total } }))}
                    onPageChanged={(page, total) => setPdfPage((p) => ({ ...p, [i]: { page, total } }))}
                    onScaleChanged={(s) => i === index && setPdfZoomed(s > 1.02)}
                    onError={() => markError(i)}
                  />
                )}
              </View>
            )}
          />
        )}
      </View>

      <View style={[styles.bottom, { paddingBottom: insets.bottom + 10 }]}>
        {current?.kind === 'pdf' && cp && cp.total > 0 && !errors[index] ? (
          <View style={styles.pill} accessibilityLiveRegion="polite">
            <Text style={styles.pillText}>{`Page ${cp.page} of ${cp.total}`}</Text>
          </View>
        ) : null}
        {items.length > 1 && (
          <View style={styles.dots}>
            {items.map((_, i) => (
              <View key={i} style={[styles.dot, i === index && { backgroundColor: '#fff' }]} />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: viewer.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
  doneBtn: { minWidth: 70 },
  done: { color: '#fff', fontSize: 17 },
  title: { color: '#fff', fontSize: 17, fontWeight: '600', flexShrink: 1 },
  area: { flex: 1 },
  bottom: { alignItems: 'center', gap: 10, minHeight: 24 },
  pill: { backgroundColor: 'rgba(255,255,255,0.16)', paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999 },
  pillText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#555' },
  errBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 30 },
  errTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  errMsg: { color: viewer.secondary, fontSize: 14, textAlign: 'center' },
});
