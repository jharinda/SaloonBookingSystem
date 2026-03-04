import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Textarea } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';

import { ReviewService } from '../services/review.service';
import { Booking } from '@org/models';

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'OK',
  4: 'Good',
  5: 'Excellent',
};

@Component({
  selector: 'lib-submit-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    Button,
    ProgressSpinner,
    Textarea,
  ],
  template: `
    <div class="review-page">

      <!-- ── Loading ─────────────────────────────────────────────────── -->
      @if (isLoading()) {
        <div class="review-state">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '48px', height: '48px' }" />
          <p>Loading booking details…</p>
        </div>
      }

      <!-- ── Load error ──────────────────────────────────────────────── -->
      @if (!isLoading() && loadError()) {
        <div class="review-state review-state--error">
          <i class="pi pi-exclamation-circle" style="font-size:2rem;color:var(--p-red-500)"></i>
          <p>{{ loadError() }}</p>
          <p-button label="Go Back" (onClick)="goBack()" />
        </div>
      }

      <!-- ── Booking not completed ────────────────────────────────────── -->
      @if (!isLoading() && !loadError() && booking() && booking()!.status !== 'COMPLETED') {
        <div class="review-state review-state--error">
          <i class="pi pi-info-circle" style="font-size:2rem;color:var(--p-red-500)"></i>
          <p>You can only leave a review for completed appointments.</p>
          <p-button label="Go Back" (onClick)="goBack()" />
        </div>
      }

      <!-- ── Success ─────────────────────────────────────────────────── -->
      @if (submitted()) {
        <div class="review-state review-state--success">
          <span class="success-emoji">✅</span>
          <p>Thank you for your review!</p>
          <small>Redirecting you to your appointments…</small>
        </div>
      }

      <!-- ── Form ────────────────────────────────────────────────────── -->
      @if (!isLoading() && !loadError() && booking() && booking()!.status === 'COMPLETED' && !submitted()) {
        <div class="review-card">

          <!-- Booking context -->
          <div class="booking-context">
            <h2>Leave a Review</h2>
            <div class="booking-meta">
              <div class="booking-meta-row">
                <i class="pi pi-shop meta-icon"></i>
                <span>{{ booking()!.salonName }}</span>
              </div>
              <div class="booking-meta-row">
                <i class="pi pi-scissors meta-icon"></i>
                <span>{{ booking()!.serviceName }}</span>
              </div>
              <div class="booking-meta-row">
                <i class="pi pi-calendar meta-icon"></i>
                <span>{{ booking()!.appointmentDate | date:'mediumDate' }}</span>
              </div>
            </div>
          </div>

          <!-- Star rating -->
          <div class="rating-section">
            <p class="rating-label">Your Rating</p>
            <div
              class="stars-row"
              (mouseleave)="hoveredRating.set(0)"
            >
              @for (star of stars; track star) {
                <i
                  class="pi star-icon"
                  [class.pi-star-fill]="star <= (hoveredRating() || selectedRating())"
                  [class.pi-star]="star > (hoveredRating() || selectedRating())"
                  [class.star-filled]="star <= (hoveredRating() || selectedRating())"
                  (mouseenter)="hoveredRating.set(star)"
                  (click)="selectedRating.set(star)"
                ></i>
              }
            </div>
            @if (hoveredRating() || selectedRating()) {
              <p class="rating-text">{{ ratingLabel() }}</p>
            }
          </div>

          <!-- Comment -->
          <div class="comment-field">
            <label class="comment-label">Your comments (optional)</label>
            <textarea
              pTextarea
              [(ngModel)]="comment"
              rows="4"
              maxlength="500"
              placeholder="Share your experience…"
              class="comment-textarea"
            ></textarea>
            <small
              class="comment-hint"
              [class.warn-orange]="comment.length >= 400 && comment.length < 480"
              [class.warn-red]="comment.length >= 480"
            >{{ comment.length }} / 500</small>
          </div>

          <!-- Submit -->
          <p-button
            label="Submit Review"
            [disabled]="selectedRating() === 0 || isSubmitting()"
            [loading]="isSubmitting()"
            (onClick)="submit()"
            styleClass="submit-btn"
          />

        </div>
      }

    </div>
  `,
  styles: [`
    .review-page {
      max-width: 560px;
      margin: 40px auto;
      padding: 0 16px;
    }

    .review-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 48px 24px;
      text-align: center;
    }

    .review-state--error p { color: var(--p-red-500, #ef4444); }
    .review-state--success { gap: 12px; }
    .success-emoji { font-size: 48px; }

    .review-card {
      display: flex;
      flex-direction: column;
      gap: 24px;
      background: #fff;
      border-radius: 12px;
      padding: 28px 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,.08);
    }

    .booking-context h2 {
      margin: 0 0 12px;
      font-size: 1.4rem;
      font-weight: 600;
    }

    .booking-meta { display: flex; flex-direction: column; gap: 6px; }
    .booking-meta-row { display: flex; align-items: center; gap: 8px; font-size: .95rem; }
    .meta-icon { font-size: 18px; color: #666; }

    .rating-section { display: flex; flex-direction: column; gap: 8px; }
    .rating-label { margin: 0; font-weight: 500; }

    .stars-row {
      display: flex;
      gap: 4px;
      cursor: pointer;
    }

    .star-icon {
      font-size: 40px;
      color: #ccc;
      transition: color .15s;
      user-select: none;
    }

    .star-filled { color: #f9a825 !important; }

    .rating-text { margin: 0; font-size: .95rem; color: #555; }

    .comment-field { width: 100%; display: flex; flex-direction: column; gap: 4px; }
    .comment-label { font-weight: 500; font-size: .9rem; color: #374151; }
    .comment-textarea { width: 100%; resize: vertical; }
    .comment-hint { font-size: .78rem; color: #9ca3af; text-align: right; }

    .warn-orange { color: #e65100 !important; }
    .warn-red    { color: #b00020 !important; }

    .submit-btn {
      align-self: flex-end;
    }
  `],
})
export class SubmitReviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reviewService = inject(ReviewService);
  private readonly msgSvc  = inject(MessageService);

  readonly stars = [1, 2, 3, 4, 5];

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly booking = signal<Booking | null>(null);

  readonly hoveredRating = signal<number>(0);
  readonly selectedRating = signal<number>(0);

  readonly isSubmitting = signal(false);
  readonly submitted = signal(false);

  comment = '';

  readonly ratingLabel = computed(() =>
    RATING_LABELS[this.hoveredRating() || this.selectedRating()] ?? '',
  );

  ngOnInit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId');

    if (!bookingId) {
      this.loadError.set('No booking ID provided.');
      this.isLoading.set(false);
      return;
    }

    this.reviewService.getBookingById(bookingId).subscribe({
      next: (booking) => {
        this.booking.set(booking);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.loadError.set(err?.error?.message ?? 'Failed to load booking details.');
        this.isLoading.set(false);
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/my-appointments']);
  }

  submit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId') ?? '';
    this.isSubmitting.set(true);

    this.reviewService
      .createReview({
        bookingId,
        rating: this.selectedRating(),
        comment: this.comment,
      })
      .subscribe({
        next: () => {
          this.isSubmitting.set(false);
          this.submitted.set(true);
          setTimeout(() => this.router.navigate(['/my-appointments']), 2000);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const msg = err?.error?.message ?? 'Failed to submit review. Please try again.';
          this.msgSvc.add({ severity: 'error', summary: 'Error', detail: msg, life: 5000 });
        },
      });
  }
}

