// ─── Enums ────────────────────────────────────────────────────────────────────

export type BookingStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'NO_SHOW';

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface CreateBookingPayload {
  salonId: string;
  serviceId: string;
  /**  ISO date string: "2026-03-15" */
  appointmentDate: string;
  /** "HH:mm", e.g. "09:30" */
  startTime: string;
  notes?: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface BookingSlot {
  /** "HH:mm" */
  time: string;
  available: boolean;
}

export interface SlotsResponse {
  /** ISO date string */
  date: string;
  slots: BookingSlot[];
}

export interface Booking {
  _id: string;
  clientId: string;
  salonId: string;
  serviceId: string;
  /** Denormalised name for display */
  salonName: string;
  /** Denormalised service name for display */
  serviceName: string;
  /** Denormalised stylist name (if assigned) */
  stylistName?: string;
  /** ISO date string: "2026-03-15" */
  appointmentDate: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  /** Price in LKR */
  totalPrice: number;
  status: BookingStatus;
  notes?: string;
  googleEventId?: string | null;
  createdAt: string;
}

// ─── Wizard draft (client-side only) ─────────────────────────────────────────

import type { Salon, SalonServiceItem } from './salon.model';

export interface BookingDraft {
  salon: Salon;
  service: SalonServiceItem;
  /** Local Date chosen in the date picker */
  date: Date;
  /** "HH:mm" time slot chosen */
  slot: string;
  notes: string;
}
