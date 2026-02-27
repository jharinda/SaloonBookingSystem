export class ReviewImageResponseDto {
  cloudinaryId: string;
  url: string;
}

export class ReviewResponseDto {
  id: string;
  salonId: string;
  bookingId: string;
  clientId: string;
  stylistId?: string;
  rating: number;
  comment?: string;
  images: ReviewImageResponseDto[];
  isVisible: boolean;
  ownerReply?: string;
  createdAt: Date;
}

export class PaginatedReviewsDto {
  data: ReviewResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
