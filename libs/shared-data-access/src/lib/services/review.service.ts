import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Review, ReviewsPage, ReplyToReviewDto } from '@org/models';

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

  /** PATCH /api/reviews/:id/reply */
  replyToReview(reviewId: string, dto: ReplyToReviewDto): Observable<Review> {
    return this.http.patch<Review>(`/api/reviews/${reviewId}/reply`, dto);
  }
}
