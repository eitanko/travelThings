/** Tiny dependency-free PDF writer for development sample data and tests (ASCII text + barcode-like bars). */

export interface PdfPageSpec {
  heading: string;
  lines: string[];
  barcode?: boolean;
}

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[^\x20-\x7e]/g, '?');

function pageContent(p: PdfPageSpec): string {
  const ops: string[] = [];
  ops.push('0.18 0.49 0.96 rg 0 722 612 70 re f'); // header band
  ops.push('BT /F1 26 Tf 1 1 1 rg 40 748 Td (' + esc(p.heading) + ') Tj ET');
  let y = 670;
  for (const line of p.lines) {
    ops.push('BT /F1 15 Tf 0.1 0.1 0.12 rg 40 ' + y + ' Td (' + esc(line) + ') Tj ET');
    y -= 28;
  }
  if (p.barcode) {
    ops.push('0 g');
    let x = 40;
    for (let i = 0; i < 60; i++) {
      const w = i % 3 === 0 ? 4 : 2;
      ops.push(`${x} 120 ${w} 90 re f`);
      x += w + 2 + (i % 5 === 0 ? 2 : 0);
    }
    ops.push('BT /F1 9 Tf 0.4 0.4 0.4 rg 40 100 Td (SAMPLE DOCUMENT - DEVELOPMENT DATA) Tj ET');
  }
  return ops.join('\n');
}

export function buildPdf(pages: PdfPageSpec[]): Uint8Array {
  const objs: string[] = [];
  const pageObjIds = pages.map((_, i) => 4 + i * 2);
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[2] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`;
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((p, i) => {
    const pid = 4 + i * 2;
    const cid = pid + 1;
    objs[pid] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${cid} 0 R >>`;
    const content = pageContent(p);
    objs[cid] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objs[id]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objs.length; id++) out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
