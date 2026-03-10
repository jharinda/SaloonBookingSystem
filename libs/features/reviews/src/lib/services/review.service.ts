import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { Booking } from '@org/models';

export interface ReviewImage {
  cloudinaryId: string;
  url: string;
}

export interface CreateReviewDto {
  salonId: string;
  bookingId: string;
  rating: number;
  comment?: string;
  images?: ReviewImage[];
}

export interface Review {
  _id: string;
  bookingId: string;
  salonId: string;
  clientId: string;
  rating: number;
  comment?: string;
  images: ReviewImage[];
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

  uploadImage(file: File): Observable<ReviewImage> {
    const form = new FormData();
    form.append('file', file);
    return this.http.post<ReviewImage>('/api/reviews/upload', form);
  }

  getSalonReviews(salonId: string, page = 1): Observable<SalonReviewsResponse> {
    const params = new HttpParams()
      .set('salonId', salonId)
      .set('page', page.toString());
    return this.http.get<SalonReviewsResponse>('/api/reviews', { params });
  }
}
