// ─── Shared user / profile types (API contracts + cross-service shapes) ─────

export type JoinRequestStatus = 'none' | 'pending' | 'approved' | 'rejected';

export interface WorkingHours {
  /** 0–6 (Sunday–Saturday) */
  day: number;
  start: string;
  end: string;
  isOff: boolean;
}

export interface PortfolioImage {
  cloudinaryId: string;
  url: string;
  caption?: string;
}

export interface PortfolioReview {
  reviewId: string;
  salonId: string;
  rating: number;
  comment: string;
  serviceName: string;
  clientName: string;
  date: Date | string;
}

/** Full notification channel flags (GET responses). */
export interface NotificationPreferences {
  email: boolean;
  sms: boolean;
  whatsapp: boolean;
  push: boolean;
}

/** Alias for response DTOs — same shape as NotificationPreferences. */
export type NotificationPreferencesResponse = NotificationPreferences;

export interface AddressPayload {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

/** Fields accepted by PATCH /users/me (superset of auth + user-service). */
export interface UpdateProfilePayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  timezone?: string;
  currency?: string;
  address?: AddressPayload;
}

export interface StylistProfileShape {
  bio?: string;
  specialties: string[];
  yearsExperience: number;
  portfolioImages: PortfolioImage[];
  portfolioReviews?: PortfolioReview[];
  currentSalonId?: string | null;
  joinRequestStatus: JoinRequestStatus;
  isAvailable: boolean;
  workingHours: WorkingHours[];
}

/** Canonical user profile shape for API responses (user-service; legacy auth parity). */
export interface UserProfileResponse {
  _id: string;
  userId?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  avatarUrl?: string;
  role: string;
  timezone?: string;
  currency?: string;
  address?: AddressPayload;
  /** Present on user-service responses; optional on legacy auth-only profile payloads. */
  notificationPreferences?: NotificationPreferences;
  stylistProfile?: StylistProfileShape;
  createdAt?: string;
  updatedAt?: string;
}
