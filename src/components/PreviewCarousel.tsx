import React, { useState } from 'react';
import { Image, LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Palette, useThemedStyles } from '@/theme';
import { Icon } from './Icon';
import { NativePdf } from './NativePdf';

export interface PreviewItem {
  uri: string;
  kind: 'pdf' | 'image';
  name: string;
  /** Extra clockwise quarter turns to show on top of the file as stored (image pages only). */
  turns?: number;
}

interface Props {
  items: PreviewItem[];
  height: number;
  /** Tap on a page. Used to open the full-screen viewer. */
  onOpen?: (index: number) => void;
  /** Shows the prototype's "Preview" pill (bottom-right). */
  showZoomPill?: boolean;
  /** Turns the page at `index` 90° clockwise. Shown only for image pages. */
  onRotate?: (index: number) => void;
  /** Disables the rotate control while a turn is being rendered. */
  rotating?: boolean;
}

/**
 * Style that shows an image turned by `turns` quarter turns inside an `aw` × `ah` box. For sideways turns the image
 * is laid out in the swapped box first, so after turning it still fits. Null when no turn is needed.
 */
function turnedStyle(turns: number, aw: number, ah: number) {
  const t = ((turns % 4) + 4) % 4;
  if (t === 0) return null;
  const sideways = t % 2 === 1;
  const width = sideways ? ah : aw;
  const height = sideways ? aw : ah;
  return {
    position: 'absolute' as const,
    left: 14 + (aw - width) / 2,
    top: 14 + (ah - height) / 2,
    width,
    height,
    borderRadius: 6,
    transform: [{ rotate: `${t * 90}deg` }],
  };
}

/** Paged, read-only thumbnail strip. First page of each PDF, the whole image otherwise. */
export function PreviewCarousel({ items, height, onOpen, showZoomPill, onRotate, rotating }: Props) {
  const { colors, styles } = useThemedStyles(makeStyles);
  const [w, setW] = useState(0);
  const [index, setIndex] = useState(0);
  const [failed, setFailed] = useState<Record<number, boolean>>({});

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (w > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / w));
  };

  return (
    <View>
      <View style={[styles.wrap, { height }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}>
            {items.map((it, i) => (
              <Pressable
                key={`${it.uri}-${i}`}
                style={{ width: w, height, padding: 14 }}
                onPress={() => onOpen?.(i)}
                accessibilityRole="imagebutton"
                accessibilityLabel={`${it.name}, page ${i + 1} of ${items.length}. Opens full screen.`}
              >
                {failed[i] ? (
                  <View style={styles.fileCard}>
                    <Icon name="alert" size={30} color={colors.secondary} />
                    <Text style={styles.fileName} numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text style={styles.fileSub}>Preview unavailable</Text>
                  </View>
                ) : it.kind === 'image' ? (
                  <Image
                    source={{ uri: it.uri }}
                    style={turnedStyle(it.turns ?? 0, w - 28, height - 28) ?? styles.img}
                    resizeMode="contain"
                    onError={() => setFailed((f) => ({ ...f, [i]: true }))}
                  />
                ) : (
                  <View style={styles.pdfBox} pointerEvents="none">
                    <NativePdf
                      source={{ uri: it.uri }}
                      page={1}
                      singlePage
                      enablePaging={false}
                      enableDoubleTapZoom={false}
                      fitPolicy={2}
                      trustAllCerts={false}
                      style={styles.pdf}
                      onError={() => setFailed((f) => ({ ...f, [i]: true }))}
                      fallback={
                        <View style={styles.fileCard}>
                          <Icon name="file" size={34} color={colors.secondary} />
                          <Text style={styles.fileName} numberOfLines={2}>
                            {it.name}
                          </Text>
                          <Text style={styles.fileSub}>PDF document</Text>
                        </View>
                      }
                    />
                  </View>
                )}
              </Pressable>
            ))}
          </ScrollView>
        )}
        {items.length > 1 && (
          <View style={styles.count}>
            <Text style={styles.countText}>{`${index + 1}/${items.length}`}</Text>
          </View>
        )}
        {onRotate && items[index]?.kind === 'image' && (
          <Pressable
            style={[styles.rotate, rotating && { opacity: 0.6 }]}
            onPress={() => onRotate(index)}
            disabled={rotating}
            accessibilityRole="button"
            accessibilityLabel={`Rotate page ${index + 1} 90 degrees clockwise`}
            accessibilityState={{ busy: rotating, disabled: rotating }}
          >
            <Icon name="rotate" size={14} color="#fff" />
            <Text style={styles.zoomText}>Rotate</Text>
          </Pressable>
        )}
        {showZoomPill && (
          <Pressable style={styles.zoom} onPress={() => onOpen?.(index)} accessibilityRole="button" accessibilityLabel="Open full-screen preview">
            <Icon name="expand" size={14} color="#fff" />
            <Text style={styles.zoomText}>Preview</Text>
          </Pressable>
        )}
      </View>
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && { backgroundColor: colors.dotActive }]} />
          ))}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) =>
  StyleSheet.create({
  wrap: { borderRadius: 18, overflow: 'hidden', backgroundColor: colors.previewBg },
  img: { width: '100%', height: '100%', borderRadius: 6 },
  pdfBox: { flex: 1, backgroundColor: '#fff', borderRadius: 6, overflow: 'hidden' },
  pdf: { flex: 1, backgroundColor: '#fff' },
  fileCard: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.placeholderCard, borderRadius: 10, padding: 22 },
  fileName: { fontSize: 14, fontWeight: '700', color: colors.muted, textAlign: 'center' },
  fileSub: { fontSize: 13, color: colors.secondary },
  count: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999 },
  countText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  zoom: { position: 'absolute', bottom: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  zoomText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  rotate: { position: 'absolute', bottom: 10, left: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.6)', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingTop: 10, minHeight: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.dot },
});
