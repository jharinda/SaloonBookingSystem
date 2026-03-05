import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';
import { MessageService } from 'primeng/api';

import { CreateReviewDto } from '@org/models';
import { ReviewService } from '@org/shared-data-access';

export interface WriteReviewDialogData {
  bookingId: string;
  salonId:   string;
  stylistId?: string;
  salonName:  string;
  serviceName: string;
}

export interface WriteReviewDialogResult {
  rating:  number;
  comment: string;
}

@Component({
  selector: 'lib-write-review-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, Button, Textarea],
  template: `
    <div class="review-body">

      <!-- Salon / service context -->
      <p class="review-context">
        <strong>{{ data.serviceName }}</strong> at <strong>{{ data.salonName }}</strong>
      </p>

      <!-- Star picker -->
      <div class="star-picker" role="group" aria-label="Select a star rating">
        @for (n of STARS; track n) {
          <button
            type="button"
            class="star-btn"
            [class.star-btn--active]="n <= hovered() || n <= rating()"
            [class.star-btn--hovered]="n <= hovered()"
            (mouseenter)="hovered.set(n)"
            (mouseleave)="hovered.set(0)"
            (click)="rating.set(n)"
            [attr.aria-label]="n + ' star' + (n !== 1 ? 's' : '')"
            [attr.aria-pressed]="n === rating()"
          >
            <i class="pi" [class.pi-star-fill]="n <= hovered() || n <= rating()" [class.pi-star]="n > hovered() && n > rating()"></i>
          </button>
        }
        <span class="star-label">{{ ratingLabel() }}</span>
      </div>

      <!-- Comment -->
      <textarea
        pTextarea
        [(ngModel)]="comment"
        rows="4"
        placeholder="Tell others about your experience (optional)…"
        maxlength="500"
        aria-label="Review comment"
        class="review-textarea"
      ></textarea>

      <p class="char-count">{{ comment.length }} / 500</p>
    </div>

    <!-- Actions -->
    <div class="review-actions">
      <p-button
        label="Cancel"
        [text]="true"
        severity="secondary"
        [disabled]="submitting()"
        (onClick)="dismiss()"
      />
      <p-button
        label="Submit Review"
        icon="pi pi-check"
        [loading]="submitting()"
        [disabled]="rating() === 0 || submitting()"
        (onClick)="submit()"
      />
    </div>
  `,
  styles: [`
    .review-body { padding: 0; }

    .review-context {
      font-size: .9rem;
      color: #6b7280;
      margin: 0 0 18px;
    }

    /* ── Stars ── */
    .star-picker {
      display: flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 16px;
    }

    .star-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 2px;
      border-radius: 4px;
      line-height: 1;
      transition: transform .1s;

      &:focus-visible { outline: 2px solid #6750a4; }
      &:hover { transform: scale(1.15); }

      .pi {
        font-size: 28px;
        color: #d1d5db;
        transition: color .1s;
      }

      &--active .pi,
      &--hovered .pi {
        color: #f59e0b;
      }
    }

    .star-label {
      font-size: .82rem;
      color: #9ca3af;
      margin-left: 8px;
      min-width: 80px;
    }

    /* ── Textarea ── */
    .review-textarea {
      width: 100%;
      resize: vertical;
    }

    .char-count {
      text-align: right;
      font-size: .75rem;
      color: #9ca3af;
      margin: 4px 0 0;
    }

    /* ── Actions ── */
    .review-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    :host-context(.app-dark) {
      .review-context { color: #a1a1aa; }
      .star-btn .pi { color: #52525b; }
      .star-label, .char-count { color: #71717a; }
    }
  `],
})
export class WriteReviewDialogComponent {
  private readonly ref          = inject(DynamicDialogRef);
  private readonly config       = inject(DynamicDialogConfig);
  private readonly reviewService = inject(ReviewService);
  private readonly msgSvc       = inject(MessageService);

  readonly data = this.config.data as WriteReviewDialogData;

  readonly STARS    = [1, 2, 3, 4, 5] as const;
  readonly rating   = signal(0);
  readonly hovered  = signal(0);
  readonly submitting = signal(false);

  comment = '';

  ratingLabel(): string {
    const v = this.hovered() || this.rating();
    return ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][v] ?? '';
  }

  submit(): void {
    if (this.rating() === 0) return;

    this.submitting.set(true);

    const dto: CreateReviewDto = {
      salonId:   this.data.salonId,
      bookingId: this.data.bookingId,
      stylistId: this.data.stylistId,
      rating:    this.rating(),
      comment:   this.comment.trim() || undefined,
    };

    this.reviewService.createReview(dto).subscribe({
      next: () => {
        this.submitting.set(false);
        this.ref.close({
          rating:  this.rating(),
          comment: this.comment.trim(),
        } satisfies WriteReviewDialogResult);
      },
      error: (err) => {
        this.submitting.set(false);
        const detail =
          err?.error?.message === 'A review for this booking already exists'
            ? 'You already submitted a review for this appointment.'
            : 'Could not submit review — please try again.';
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail, life: 4000 });
      },
    });
  }

  dismiss(): void {
    this.ref.close(undefined);
  }
}
