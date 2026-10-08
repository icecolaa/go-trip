import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const FONT_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts', 'NotoSansSC-Regular.otf');

const PAGE_W = 595; // A4 72dpi
const PAGE_H = 842;
const MARGIN = 48;

type Stop = { time?: string; name?: string; place?: string; note?: string; cost?: number };
type Day = { d?: number; title?: string; date?: string; stops?: Stop[] };
type Payload = {
  trip: { title?: string; destination?: string; dateLabel?: string; coverColor?: string; coverEmoji?: string };
  days: Day[];
};

const COLOR: Record<string, [number, number, number]> = {
  '#2E92ED': [0.18, 0.57, 0.93], '#FFC414': [1, 0.77, 0.08], '#2FA96E': [0.18, 0.66, 0.43],
  '#FF8A5C': [1, 0.54, 0.36], '#7B8CFF': [0.48, 0.55, 1], '#2BB8A8': [0.17, 0.72, 0.66],
};

/** 行程 → PDF（A4，封面页+每日页）。中文依赖 NotoSansSC 字体文件。返回 Buffer */
export function buildTripPDF(payload: Payload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: { Title: payload.trip?.title || '行程' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('cn', FONT_PATH);
      render(doc, payload);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

function render(doc: PDFKit.PDFDocument, payload: Payload) {
  const trip = payload.trip || {};
  const color = COLOR[trip.coverColor] || COLOR['#2E92ED'];

  /* ---- 封面页 ---- */
  doc.rect(0, 0, PAGE_W, PAGE_H * 0.46).fill(color);
  doc.font('cn').fillColor('#ffffff');
  doc.fontSize(64).text(trip.coverEmoji || '🧭', MARGIN, PAGE_H * 0.13);
  doc.fontSize(30).text(trip.title || '我的旅程', MARGIN, PAGE_H * 0.28, { width: PAGE_W - MARGIN * 2 });
  doc.fontSize(14).fillColor('#ffffff');
  const sub = [trip.destination, trip.dateLabel].filter(Boolean).join(' · ');
  if (sub) doc.text(sub, MARGIN, PAGE_H * 0.28 + 46, { width: PAGE_W - MARGIN * 2 });
  doc.fontSize(10).fillColor('#ffffff');
  doc.text('出发吧 GoTrip · 行程计划', MARGIN, PAGE_H * 0.46 - 26);

  /* ---- 每日 ---- */
  doc.fillColor('#182A3D');
  let y = PAGE_H * 0.46 + 40;
  (payload.days || []).forEach(day => {
    const head = `D${day.d || ''} ${day.title || ''}`.trim() + (day.date ? `  ·  ${day.date}` : '');
    if (y > PAGE_H - MARGIN - 60) { doc.addPage(); y = MARGIN; }
    doc.fontSize(15).text(head, MARGIN, y);
    y += 22;
    (day.stops || []).forEach(st => {
      const line1 = [st.time, st.name].filter(Boolean).join('  ');
      if (y > PAGE_H - MARGIN - 30) { doc.addPage(); y = MARGIN; }
      doc.fontSize(11).fillColor('#182A3D').text('· ' + line1, MARGIN + 14, y, { width: PAGE_W - MARGIN * 2 - 14 });
      y += 16;
      const extras: string[] = [];
      if (st.place) extras.push(st.place);
      if (st.cost) extras.push(`¥${st.cost}`);
      if (extras.length) {
        doc.fontSize(9).fillColor('#7A8FA5').text('   ' + extras.join(' · '), MARGIN + 14, y, { width: PAGE_W - MARGIN * 2 - 14 });
        y += 13;
      }
      if (st.note) {
        doc.fontSize(9).fillColor('#51637A').text('   备注：' + st.note, MARGIN + 14, y, { width: PAGE_W - MARGIN * 2 - 14 });
        y += 13;
      }
      y += 6;
    });
    y += 14;
  });

}
