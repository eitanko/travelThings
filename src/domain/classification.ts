import type { Category, Document, DocumentType, FilterCategory } from './types';

export type IconName =
  | 'plane' | 'bed' | 'bus' | 'ticket' | 'passport' | 'visa' | 'file' | 'plus' | 'search'
  | 'chevR' | 'chevL' | 'x' | 'camera' | 'image' | 'scan' | 'folder' | 'layers' | 'check' | 'expand' | 'alert' | 'rotate';

export const CATEGORY_LABEL: Record<Category, string> = {
  transportation: 'Transportation',
  accommodation: 'Accommodation',
  activities: 'Activities',
  personal: 'Personal Documents',
  other: 'Other',
};

/** Which date field is the primary one for a category, and what it is called. */
export const CATEGORY_DATE_LABEL: Record<Category, string> = {
  transportation: 'Travel date',
  accommodation: 'Check-in date',
  activities: 'Event date',
  personal: 'Event date',
  other: 'Event date',
};

export interface TypeInfo {
  label: string;
  category: Category;
  icon: IconName;
}

export const TYPE_INFO: Record<DocumentType, TypeInfo> = {
  flight_reservation: { label: 'Flight reservation', category: 'transportation', icon: 'plane' },
  boarding_pass: { label: 'Boarding pass', category: 'transportation', icon: 'plane' },
  bus_ticket: { label: 'Bus ticket', category: 'transportation', icon: 'bus' },
  train_ticket: { label: 'Train ticket', category: 'transportation', icon: 'bus' },
  ferry_ticket: { label: 'Ferry ticket', category: 'transportation', icon: 'bus' },
  other_transport: { label: 'Other transport', category: 'transportation', icon: 'bus' },
  hotel_reservation: { label: 'Hotel reservation', category: 'accommodation', icon: 'bed' },
  apartment_reservation: { label: 'Apartment/Airbnb reservation', category: 'accommodation', icon: 'bed' },
  other_accommodation: { label: 'Other accommodation', category: 'accommodation', icon: 'bed' },
  attraction_ticket: { label: 'Museum/attraction ticket', category: 'activities', icon: 'ticket' },
  tour_ticket: { label: 'Tour ticket', category: 'activities', icon: 'ticket' },
  event_ticket: { label: 'Event/concert ticket', category: 'activities', icon: 'ticket' },
  restaurant_reservation: { label: 'Restaurant reservation', category: 'activities', icon: 'ticket' },
  other_activity: { label: 'Other activity', category: 'activities', icon: 'ticket' },
  passport: { label: 'Passport', category: 'personal', icon: 'passport' },
  national_id: { label: 'National ID', category: 'personal', icon: 'passport' },
  drivers_license: { label: 'Driver’s license', category: 'personal', icon: 'passport' },
  visa: { label: 'Visa/entry permit', category: 'personal', icon: 'visa' },
  social_security_card: { label: 'Social Security card', category: 'personal', icon: 'passport' },
  travel_insurance: { label: 'Travel insurance', category: 'personal', icon: 'file' },
  other_personal: { label: 'Other personal document', category: 'personal', icon: 'passport' },
  itinerary: { label: 'Travel itinerary', category: 'other', icon: 'file' },
  guide_map: { label: 'Travel guide/map', category: 'other', icon: 'file' },
  general_file: { label: 'General file', category: 'other', icon: 'file' },
};

export const DEFAULT_CATEGORY: Category = 'other';
export const DEFAULT_TYPE: DocumentType = 'general_file';

/** Types offered for each category, in display order. */
export const CATEGORY_TYPES: Record<Category, DocumentType[]> = {
  transportation: ['flight_reservation', 'boarding_pass', 'bus_ticket', 'train_ticket', 'ferry_ticket', 'other_transport'],
  accommodation: ['hotel_reservation', 'apartment_reservation', 'other_accommodation'],
  activities: ['attraction_ticket', 'tour_ticket', 'event_ticket', 'restaurant_reservation', 'other_activity'],
  personal: ['passport', 'national_id', 'drivers_license', 'visa', 'social_security_card', 'travel_insurance', 'other_personal'],
  other: ['itinerary', 'guide_map', 'general_file'],
};

/** The catch-all type used when a category is chosen without a specific type. */
export const fallbackType = (c: Category): DocumentType => CATEGORY_TYPES[c][CATEGORY_TYPES[c].length - 1] as DocumentType;

export const typeInfo = (d: Pick<Document, 'type'>): TypeInfo => TYPE_INFO[d.type] ?? TYPE_INFO[DEFAULT_TYPE];

/** Existing filter chips (#14 will redesign these) mapped onto the new categories. */
export function filterOf(c: Category): Exclude<FilterCategory, 'all'> {
  return c === 'personal' ? 'ids' : c === 'other' ? 'other' : 'bookings';
}

/** Type keys written by earlier versions (and the iOS share extension) → new classification. Unknown → Other/General file. */
export const LEGACY_TYPE_MAP: Record<string, DocumentType> = {
  flight: 'flight_reservation',
  hotel: 'hotel_reservation',
  transport: 'other_transport',
  attraction: 'attraction_ticket',
  passport: 'passport',
  visa: 'visa',
  other: 'general_file',
};

/** Mirrors migration v7 so the share-package reader and tests agree with the database. */
export const normalizeLegacyType = (v: unknown): DocumentType | null => {
  if (typeof v !== 'string') return null;
  if (v in TYPE_INFO) return v as DocumentType;
  return LEGACY_TYPE_MAP[v] ?? null;
};

/** Which date is the primary field for the category: expiration for personal documents, otherwise the event date. */
export const primaryDate = (c: Category): 'activityDate' | 'expirationDate' => (c === 'personal' ? 'expirationDate' : 'activityDate');

/** Resolves possibly-unset metadata to a stored classification. Category always follows the type. */
export function resolveClassification(m: { category: Category | null; type: DocumentType | null }): { category: Category; type: DocumentType } {
  const type = m.type ?? (m.category ? fallbackType(m.category) : DEFAULT_TYPE);
  return { category: TYPE_INFO[type].category, type };
}
