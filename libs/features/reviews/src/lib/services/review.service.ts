import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Booking } from '@org/models';

export interface CreateReviewDto {
  bookingId: string;
  rating: number;
  comment?: string;
}

export interface Review {
  _id: string;
  bookingId: string;
  salonId: string;
  clientId: string;
  rating: number;
  comment?: string;
  createdAt: string;
}

export interface SalonReviewsResponse {
  reviews: Review[];
  total: number;
  page: number;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);

  getBookingById(bookingId: string): Observable<Booking> {
    return this.http.get<Booking>(`/api/bookings/${bookingId}`);
  }

  createReview(dto: CreateReviewDto): Observable<Review> {
    return this.http.post<Review>('/api/reviews', dto);
  }

  getSalonReviews(salonId: string, page = 1): Observable<SalonReviewsResponse> {
    const params = new HttpParams()
      .set('salonId', salonId)
      .set('page', page.toString());
    return this.http.get<SalonReviewsResponse>('/api/reviews', { params });
  }
}
