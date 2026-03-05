// ─── Review Entity ────────────────────────────────────────────────────────────

export interface Review {
  _id: string;
  salonId: string;
  bookingId: string;
  clientId: string;
  /** Denormalised for display */
  clientName: string;
  /** URL or null */
  clientAvatar?: string | null;
  /** 1–5 */
  rating: number;
  comment: string;
  /** Owner reply, if any */
  ownerReply?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewsPage {
  data: Review[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateReviewDto {
  salonId: string;
  bookingId: string;
  rating: number;
  comment?: string;
  stylistId?: string;
}

export interface ReplyToReviewDto {
  reply: string;
}
