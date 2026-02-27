// ─── Domain Entities ──────────────────────────────────────────────────────────

export interface SalonServiceItem {
  _id: string;
  name: string;
  category: string;
  /** Duration in minutes */
  duration: number;
  /** Price in LKR */
  price: number;
  description?: string;
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

export interface Salon {
  _id: string;
  name: string;
  description?: string;
  address: SalonAddress;
  phone: string;
  email: string;
  /** Ordered list of image URLs; first is the cover */
  images?: string[];
  services: SalonServiceItem[];
  workingHours?: Record<string, SalonWorkingHours>;
  /** Average rating 0–5 */
  rating: number;
  reviewCount: number;
  isApproved: boolean;
  isActive: boolean;
  ownerId: string;
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
