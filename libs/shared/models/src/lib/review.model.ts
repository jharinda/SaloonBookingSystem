// ─── Review Entity ────────────────────────────────────────────────────────────

export interface Review {
  _id: string;
  salonId: string;
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
  rating: number;
  comment: string;
}

export interface ReplyToReviewDto {
  reply: string;
}
