// ─── Enums ────────────────────────────────────────────────────────────────────

/** Canonical booking lifecycle — shared by booking-service schema and frontend. */
export enum BookingStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW = 'NO_SHOW',
}

// ─── API payloads ─────────────────────────────────────────────────────────────

export interface BookedServicePayload {
  serviceId: string;
  name: string;
  price: number;
  durationMinutes: number;
}

export interface CreateBookingPayload {
  salonId: string;
  /** Denormalised salon name — stored server-side for display in appointment lists */
  salonName: string;
  stylistId?: string;
  services: BookedServicePayload[];
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
  /** Denormalised client full name (set at booking time) */
  clientName?: string;
  salonId: string;
  /** Denormalised salon name */
  salonName: string;
  /** Name of the primary service (services[0].name) */
  serviceName: string;
  /** Assigned stylist user ID */
  stylistId?: string;
  /** Denormalised stylist name (if assigned) */
  stylistName?: string;
  /** Auto-assigned station ID */
  stationId?: string;
  /** Denormalised station name */
  stationName?: string;
  services: BookedServicePayload[];
  /** ISO date string: "2026-03-15" */
  appointmentDate: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm" */
  endTime: string;
  /** Price in the user's configured currency */
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
