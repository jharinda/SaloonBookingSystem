import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
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
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="review-page">

      <!-- ── Loading ─────────────────────────────────────────────────── -->
      @if (isLoading()) {
        <div class="review-state">
          <mat-spinner diameter="48" />
          <p>Loading booking details…</p>
        </div>
      }

      <!-- ── Load error ──────────────────────────────────────────────── -->
      @if (!isLoading() && loadError()) {
        <div class="review-state review-state--error">
          <mat-icon color="warn">error_outline</mat-icon>
          <p>{{ loadError() }}</p>
          <button mat-raised-button (click)="goBack()">Go Back</button>
        </div>
      }

      <!-- ── Booking not completed ────────────────────────────────────── -->
      @if (!isLoading() && !loadError() && booking() && booking()!.status !== 'COMPLETED') {
        <div class="review-state review-state--error">
          <mat-icon color="warn">info_outline</mat-icon>
          <p>You can only leave a review for completed appointments.</p>
          <button mat-raised-button (click)="goBack()">Go Back</button>
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
                <mat-icon class="meta-icon">store</mat-icon>
                <span>{{ booking()!.salonName }}</span>
              </div>
              <div class="booking-meta-row">
                <mat-icon class="meta-icon">content_cut</mat-icon>
                <span>{{ booking()!.serviceName }}</span>
              </div>
              <div class="booking-meta-row">
                <mat-icon class="meta-icon">calendar_today</mat-icon>
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
                <mat-icon
                  class="star-icon"
                  [class.star-filled]="star <= (hoveredRating() || selectedRating())"
                  (mouseenter)="hoveredRating.set(star)"
                  (click)="selectedRating.set(star)"
                >
                  {{ star <= (hoveredRating() || selectedRating()) ? 'star' : 'star_border' }}
                </mat-icon>
              }
            </div>
            @if (hoveredRating() || selectedRating()) {
              <p class="rating-text">{{ ratingLabel() }}</p>
            }
          </div>

          <!-- Comment -->
          <mat-form-field appearance="outline" class="comment-field">
            <mat-label>Your comments (optional)</mat-label>
            <textarea
              matInput
              [(ngModel)]="comment"
              rows="4"
              maxlength="500"
              placeholder="Share your experience…"
            ></textarea>
            <mat-hint
              [class.warn-orange]="comment.length >= 400 && comment.length < 480"
              [class.warn-red]="comment.length >= 480"
              align="end"
            >{{ comment.length }} / 500</mat-hint>
          </mat-form-field>

          <!-- Submit -->
          <button
            mat-raised-button
            color="primary"
            class="submit-btn"
            [disabled]="selectedRating() === 0 || isSubmitting()"
            (click)="submit()"
          >
            @if (isSubmitting()) {
              <mat-spinner diameter="20" color="accent" />
            } @else {
              Submit Review
            }
          </button>

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

    .review-state--error p { color: var(--mat-sys-error, #b00020); }
    .review-state--success { gap: 12px; }
    .success-emoji { font-size: 48px; }

    .review-card {
      display: flex;
      flex-direction: column;
      gap: 24px;
      background: var(--mat-sys-surface, #fff);
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
    .meta-icon { font-size: 18px; width: 18px; height: 18px; color: #666; }

    .rating-section { display: flex; flex-direction: column; gap: 8px; }
    .rating-label { margin: 0; font-weight: 500; }

    .stars-row {
      display: flex;
      gap: 4px;
      cursor: pointer;
    }

    .star-icon {
      font-size: 40px;
      width: 40px;
      height: 40px;
      color: #ccc;
      transition: color .15s;
      user-select: none;
    }

    .star-filled { color: #f9a825; }

    .rating-text { margin: 0; font-size: .95rem; color: #555; }

    .comment-field { width: 100%; }

    ::ng-deep .warn-orange { color: #e65100 !important; }
    ::ng-deep .warn-red    { color: #b00020 !important; }

    .submit-btn {
      align-self: flex-end;
      min-width: 148px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
  `],
})
export class SubmitReviewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly reviewService = inject(ReviewService);
  private readonly snackBar = inject(MatSnackBar);

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
          this.snackBar.open(msg, 'Close', { duration: 5000 });
        },
      });
  }
}

