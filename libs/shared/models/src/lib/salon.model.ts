// ─── Domain Entities ──────────────────────────────────────────────────────────

export interface SalonServiceItem {
  _id: string;
  name: string;
  category: string;
  /** Duration in minutes */
  duration: number;
  /** Price in the salon's configured currency */
  price: number;
  description?: string;
  /** Whether the service is currently offered */
  active?: boolean;
}

export interface SalonAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  lat?: number;
  lng?: number;
}

export interface SalonWorkingHours {
  open: string;   // "09:00"
  close: string;  // "18:00"
  isOpen: boolean;
}

/** Shape of each image stored in the salon's images array */
export interface SalonImage {
  cloudinaryId: string;
  url: string;
  isPrimary?: boolean;
}

/** Shape of each entry in the backend's operatingHours array */
export interface SalonOperatingHours {
  day: number;     // 0 = Sunday … 6 = Saturday
  open: string;    // "HH:mm"
  close: string;   // "HH:mm"
  closed: boolean;
}

export interface Salon {
  _id: string;
  name: string;
  description?: string;
  address: SalonAddress;
  phone: string;
  email: string;
  /** Ordered list of salon images; the primary image comes first */
  images?: SalonImage[];
  services: SalonServiceItem[];
  /** Raw operating-hours array as returned by the backend */
  operatingHours?: SalonOperatingHours[];
  /** Normalised working-hours record (derived by frontend services from operatingHours) */
  workingHours?: Record<string, SalonWorkingHours>;
  /** Staff member user IDs */
  staff?: string[];
  /** Average rating 0–5 */
  rating: number;
  reviewCount: number;
  isApproved: boolean;
  isActive: boolean;
  ownerId: string;
  cancellationWindowHours?: number;
  autoConfirmBookings?: boolean;
  /** Per-type break limits set by the salon owner */
  breakLimits?: SalonBreakLimits;
}

export interface SalonBreakLimits {
  LUNCH: number;
  COFFEE: number;
  PERSONAL: number;
  OTHER: number;
}

// ─── Search ───────────────────────────────────────────────────────────────────

export interface SalonSearchQuery {
  /** Full-text search term */
  q?: string;
  city?: string;
  /** Service category or name */
  service?: string;
  lat?: number;
  lng?: number;
  /** Radius in kilometres (geo search) */
  radius?: number;
  page?: number;
  limit?: number;
}

export interface SalonSearchResponse {
  data: Salon[];
  total: number;
  page: number;
  limit: number;
}
