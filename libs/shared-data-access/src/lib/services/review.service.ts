import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { CreateReviewDto, Review, ReviewsPage, ReplyToReviewDto, UploadReviewImageResult } from '@org/models';

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);

  /** GET /api/reviews?salonId=:id&page=:p&limit=:l */
  getReviewsForSalon(
    salonId: string,
    page = 1,
    limit = 10,
  ): Observable<ReviewsPage> {
    const params = new HttpParams()
      .set('salonId', salonId)
      .set('page', String(page))
      .set('limit', String(limit));
    return this.http.get<ReviewsPage>('/api/reviews', { params });
  }

  /**
   * GET /api/reviews/my
   * Returns the authenticated user's own reviews (for cross-referencing with bookings).
   */
  getMyReviews(): Observable<Review[]> {
    return this.http.get<Review[]>('/api/reviews/my').pipe(
      map((res) => (Array.isArray(res) ? res : [])),
    );
  }

  /**
   * POST /api/reviews
   * Submits a new review for a completed booking.
   */
  createReview(dto: CreateReviewDto): Observable<Review> {
    return this.http.post<Review>('/api/reviews', dto);
  }

  /** PATCH /api/reviews/:id/reply */
  replyToReview(reviewId: string, dto: ReplyToReviewDto): Observable<Review> {
    return this.http.patch<Review>(`/api/reviews/${reviewId}/reply`, dto);
  }

  /**
   * POST /api/reviews/upload
   * Uploads a single image file to Cloudinary via the review-service.
   * Returns { cloudinaryId, url } to be included in the CreateReviewDto.
   */
  uploadReviewImage(file: File): Observable<UploadReviewImageResult> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<UploadReviewImageResult>('/api/reviews/upload', form);
  }
}
