import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '@/theme';

/**
 * Over-sampling factor. iOS decodes a RN <Image> at its layout size, so a plain pinch-zoomed image would be
 * rasterized at 1× and look soft (QR codes, small print). We lay the image out at F× its fitted size, start
 * zoomed out to 1/F, and let UIScrollView's native pinch/pan zoom in from there, so the bitmap has real detail.
 */
const OVERSAMPLE = 2;
const MAX_FIT_ZOOM = 6; // maximum zoom relative to the "fit to screen" size

interface Props {
  uri: string;
  width: number;
  height: number;
  onError?: () => void;
}

export function ZoomableImage({ uri, width, height, onError }: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => alive && setSize({ w, h }),
      () => {
        if (!alive) return;
        setFailed(true);
        onError?.();
      },
    );
    return () => {
      alive = false;
    };
  }, [uri, onError]);

  if (failed) {
    return (
      <View style={[styles.center, { width, height }]}>
        <Text style={styles.err}>This image can’t be opened.</Text>
      </View>
    );
  }
  if (!size) {
    return (
      <View style={[styles.center, { width, height }]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  const fit = Math.min(width / size.w, height / size.h);
  const fitW = size.w * fit;
  const fitH = size.h * fit;

  return (
    <ScrollView
      style={{ width, height }}
      contentContainerStyle={{ width: fitW * OVERSAMPLE, height: fitH * OVERSAMPLE }}
      minimumZoomScale={1 / OVERSAMPLE}
      maximumZoomScale={MAX_FIT_ZOOM / OVERSAMPLE}
      zoomScale={1 / OVERSAMPLE}
      bouncesZoom
      centerContent
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      pinchGestureEnabled
      directionalLockEnabled={false}
      accessibilityLabel="Zoomable image. Pinch to zoom, drag to pan."
    >
      <Image source={{ uri }} style={{ width: fitW * OVERSAMPLE, height: fitH * OVERSAMPLE }} resizeMode="contain" onError={() => setFailed(true)} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  err: { color: colors.secondary, fontSize: 15 },
});
