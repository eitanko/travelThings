import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { IconName } from '@/domain/documents';

type El =
  | { t: 'p'; d: string }
  | { t: 'c'; cx: number; cy: number; r: number }
  | { t: 'r'; x: number; y: number; w: number; h: number; rx: number };

const p = (d: string): El => ({ t: 'p', d });

/** SVG path data copied from the prototype's icon table (24×24, stroke style). */
const ICONS: Record<IconName, El[]> = {
  plane: [p('M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z')],
  bed: [p('M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9')],
  bus: [
    p('M8 6v6M15 6v6M2 12h19.6'),
    p('M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3'),
    { t: 'c', cx: 7, cy: 18, r: 2 },
    p('M9 18h5'),
    { t: 'c', cx: 16, cy: 18, r: 2 },
  ],
  ticket: [
    p('M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z'),
    p('M13 5v2M13 17v2M13 11v2'),
  ],
  passport: [{ t: 'r', x: 5, y: 2.5, w: 14, h: 19, rx: 2 }, { t: 'c', cx: 12, cy: 10, r: 3 }, p('M8.5 17h7')],
  visa: [{ t: 'r', x: 3, y: 5, w: 18, h: 14, rx: 2 }, p('M3 10h18M7 15h4')],
  file: [p('M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'), p('M14 2v6h6')],
  plus: [p('M12 5v14M5 12h14')],
  search: [{ t: 'c', cx: 11, cy: 11, r: 7 }, p('m20 20-3.5-3.5')],
  chevR: [p('m9 6 6 6-6 6')],
  chevL: [p('m15 6-6 6 6 6')],
  x: [p('M6 6l12 12M18 6 6 18')],
  camera: [
    p('M3 8a2 2 0 0 1 2-2h2l1.5-2h7L17 6h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'),
    { t: 'c', cx: 12, cy: 13, r: 3.8 },
  ],
  image: [{ t: 'r', x: 3, y: 4, w: 18, h: 16, rx: 2.5 }, { t: 'c', cx: 9, cy: 10, r: 1.8 }, p('m21 16-5-5-9 9')],
  scan: [p('M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2'), p('M7 12h10')],
  folder: [p('M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')],
  layers: [p('m12 3 9 5-9 5-9-5z'), p('m3 13 9 5 9-5')],
  check: [p('m5 12.5 4.5 4.5L19 7.5')],
  expand: [p('M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5')],
  alert: [{ t: 'c', cx: 12, cy: 12, r: 9 }, p('M12 7v6M12 16.5v.5')],
};

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, color = '#000', strokeWidth = 1.9 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no">
      {ICONS[name].map((el, i) => {
        const common = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
        if (el.t === 'p') return <Path key={i} d={el.d} {...common} />;
        if (el.t === 'c') return <Circle key={i} cx={el.cx} cy={el.cy} r={el.r} {...common} />;
        return <Rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={el.rx} {...common} />;
      })}
    </Svg>
  );
}
