import { File, Paths } from 'expo-file-system';
import { addDaysISO } from '@/domain/dates';
import type { DocumentType } from '@/domain/types';
import type { DocumentService } from '@/services/documentService';
import { buildPdf, type PdfPageSpec } from './pdf';

interface Sample {
  fileName: string;
  title: string | null;
  type: DocumentType;
  offsetDays: number | null;
  pages: PdfPageSpec[];
}

const SAMPLES: Sample[] = [
  {
    fileName: 'SK395-boarding-pass.pdf',
    title: 'Flight to Barcelona',
    type: 'flight',
    offsetDays: 28,
    pages: [
      { heading: 'Skyline Air - Boarding pass', lines: ['Passenger: ALEX TRAVELER', 'Flight: SK 395', 'From: Tel Aviv (TLV)', 'To: Barcelona (BCN)', 'Gate / Seat: C14 / 12A'], barcode: true },
      { heading: 'E-ticket receipt', lines: ['Booking ref: K7QX2M', 'Fare: Economy Light', 'Baggage: 1 x 23 kg'] },
    ],
  },
  {
    fileName: 'Hotel Pyrenees booking.pdf',
    title: null, // intentionally untitled: the library shows the original filename
    type: 'hotel',
    offsetDays: 30,
    pages: [
      { heading: 'Hotel Pyrenees - Confirmation', lines: ['Guest: Alex Traveler', 'Check-in: from 15:00', 'Check-out: until 11:00', 'Room: Double, mountain view', 'Confirmation: HP-88213'] },
      { heading: 'Terms and notes', lines: ['Present this document and a photo ID', 'Free changes up to 24h before'] },
    ],
  },
  {
    fileName: 'alpbus-ticket.pdf',
    title: 'Bus Barcelona to Andorra',
    type: 'transport',
    offsetDays: 30,
    pages: [{ heading: 'AlpBus - Bus ticket', lines: ['Passenger: Alex Traveler', 'Route: Barcelona Nord - Andorra la Vella', 'Departs: 08:30', 'Seat: 14'], barcode: true }],
  },
  {
    fileName: 'caldea-entry.pdf',
    title: 'Attraction tickets',
    type: 'attraction',
    offsetDays: 32,
    pages: [{ heading: 'Caldea Spa - Entry tickets', lines: ['Visitors: 2 adults', 'Slot: 16:00 - 19:00', 'Order: CAL-55021'], barcode: true }],
  },
  {
    fileName: 'passport-photo-page.pdf',
    title: 'Passport copy',
    type: 'passport',
    offsetDays: null,
    pages: [{ heading: 'Republic of Examplia - Passport', lines: ['Surname: TRAVELER', 'Given name: ALEX', 'Passport no: X1234567', 'Expiry: 18 APR 2031'] }],
  },
  {
    fileName: 'rail-catalunya-r11.pdf',
    title: 'Old train ticket',
    type: 'transport',
    offsetDays: -45,
    pages: [{ heading: 'Rail Catalunya - Train ticket', lines: ['Train: R11 07:12', 'Coach / Seat: 3 / 21'], barcode: true }],
  },
  {
    fileName: 'AeroLink-shuttle-voucher.pdf',
    title: 'Airport shuttle voucher',
    type: 'transport',
    offsetDays: 0,
    pages: [{ heading: 'AeroLink - Shuttle voucher', lines: ['Passengers: 1', 'Voucher: AL-7731', 'Pickup: Terminal 1'], barcode: true }],
  },
];

/**
 * Development only. Writes real PDFs to the cache and imports them through the normal DocumentService
 * pipeline (copy, verify, SQLite), so sample data exercises exactly the same code path as user files.
 * Dates are relative to today so Today/Upcoming/Past groups are populated.
 */
export async function loadSampleDocuments(svc: DocumentService): Promise<number> {
  let added = 0;
  for (const s of SAMPLES) {
    const file = new File(Paths.cache, `sample-${s.fileName}`);
    if (file.exists) file.delete();
    file.create();
    file.write(buildPdf(s.pages));
    const prepared = await svc.prepare([{ uri: file.uri, name: s.fileName, mimeType: 'application/pdf' }]);
    if (prepared.duplicate) continue;
    await svc.commit(
      prepared,
      { title: s.title, type: s.type, activityDate: s.offsetDays === null ? null : addDaysISO(s.offsetDays) },
      { kind: 'new' },
    );
    added++;
  }
  return added;
}
