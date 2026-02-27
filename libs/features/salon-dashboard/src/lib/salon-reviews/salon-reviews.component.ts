import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

import { ReviewService, SalonAdminService } from '@org/shared-data-access';
import { Review } from '@org/models';

@Component({
  selector: 'lib-salon-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Reviews</h1>
      <p class="page-subtitle">{{ total() }} review{{ total() === 1 ? '' : 's' }} in total</p>
    </div>

    @if (isLoading() && reviews().length === 0) {
      <div class="state-center"><mat-spinner diameter="36" /></div>
    } @else if (reviews().length === 0) {
      <div class="state-center state--empty">
        <mat-icon>star_border</mat-icon>
        <p>No reviews yet.</p>
      </div>
    } @else {
      <div class="reviews-list">
        @for (review of reviews(); track review._id) {
          <div class="review-card">

            <!-- Header -->
            <div class="review-header">
              <div class="reviewer-avatar">
                @if (review.clientAvatar) {
                  <img [src]="review.clientAvatar" [alt]="review.clientName" class="avatar-img" />
                } @else {
                  <mat-icon class="avatar-icon">account_circle</mat-icon>
                }
              </div>
              <div class="reviewer-info">
                <div class="reviewer-name">{{ review.clientName }}</div>
                <div class="review-date">{{ review.createdAt | date: 'mediumDate' }}</div>
              </div>
              <div class="review-stars" [attr.aria-label]="review.rating + ' out of 5 stars'">
                @for (star of starsFor(review.rating); track $index) {
                  <mat-icon class="star" [class.star--filled]="star">star{{ star ? '' : '_border' }}</mat-icon>
                }
              </div>
            </div>

            <!-- Comment -->
            <p class="review-comment">{{ review.comment }}</p>

            <!-- Existing reply -->
            @if (review.ownerReply) {
              <div class="owner-reply">
                <mat-icon class="reply-icon">reply</mat-icon>
                <div>
                  <div class="reply-label">Your reply</div>
                  <p class="reply-text">{{ review.ownerReply }}</p>
                </div>
              </div>
            }

            <!-- Reply form toggle -->
            @if (!review.ownerReply && replyOpenFor() !== review._id) {
              <button mat-stroked-button class="reply-btn" (click)="openReply(review._id)">
                <mat-icon>reply</mat-icon>
                Reply
              </button>
            }

            @if (replyOpenFor() === review._id) {
              <div class="reply-form">
                <textarea
                  class="reply-textarea"
                  rows="3"
                  placeholder="Write your reply…"
                  [(ngModel)]="replyText"
                  [ngModelOptions]="{ standalone: true }"
                ></textarea>
                <div class="reply-actions">
                  <button mat-stroked-button (click)="closeReply()">Cancel</button>
                  <button
                    mat-flat-button
                    color="primary"
                    [disabled]="!replyText.trim() || isReplying()"
                    (click)="submitReply(review)"
                  >
                    @if (isReplying()) { <mat-spinner diameter="16" /> }
                    @else { Submit }
                  </button>
                </div>
              </div>
            }

          </div>
        }
      </div>

      <!-- Pagination -->
      @if (hasMore()) {
        <div class="load-more">
          <button
            mat-stroked-button
            [disabled]="isLoading()"
            (click)="loadMore()"
          >
            @if (isLoading()) { <mat-spinner diameter="18" /> }
            @else { Load more }
          </button>
        </div>
      }
    }
  `,
  styles: [`
    .page-header { margin-bottom: 28px; }
    .page-title  { font-size: 1.5rem; font-weight: 700; margin: 0 0 4px; color: #111827; }
    .page-subtitle { font-size: .85rem; color: #6b7280; margin: 0; }

    .state-center {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      padding: 80px 24px;
      color: #9ca3af;
    }

    .state--empty mat-icon { font-size: 2.5rem; width: 2.5rem; height: 2.5rem; color: #d1d5db; }

    .reviews-list { display: flex; flex-direction: column; gap: 16px; max-width: 720px; }

    .review-card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      padding: 18px;
    }

    .review-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }

    .reviewer-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      overflow: hidden;
      background: #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .avatar-img { width: 100%; height: 100%; object-fit: cover; }
    .avatar-icon { color: #9ca3af; font-size: 1.5rem; width: 1.5rem; height: 1.5rem; }

    .reviewer-info { flex: 1; min-width: 0; }
    .reviewer-name { font-weight: 600; font-size: .9rem; color: #111827; }
    .review-date   { font-size: .75rem; color: #9ca3af; margin-top: 1px; }

    .review-stars { display: flex; gap: 1px; margin-left: auto; }
    .star { font-size: 1rem; width: 1rem; height: 1rem; color: #d1d5db; }
    .star--filled { color: #f59e0b; }

    .review-comment {
      font-size: .9rem;
      color: #374151;
      line-height: 1.6;
      margin: 0 0 12px;
    }

    .owner-reply {
      display: flex;
      gap: 10px;
      background: #f8f9fa;
      border-left: 3px solid var(--mat-sys-primary, #6750A4);
      border-radius: 4px;
      padding: 10px 14px;
      margin-bottom: 12px;
    }

    .reply-icon { color: var(--mat-sys-primary, #6750A4); font-size: 1rem; width: 1rem; height: 1rem; flex-shrink: 0; }
    .reply-label { font-size: .72rem; font-weight: 600; color: #9ca3af; text-transform: uppercase; margin-bottom: 2px; }
    .reply-text  { font-size: .85rem; color: #374151; margin: 0; }

    .reply-btn { margin-top: 4px; font-size: .8rem; height: 32px; }

    .reply-form { margin-top: 12px; }
    .reply-textarea {
      width: 100%;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: .88rem;
      resize: vertical;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;

      &:focus { border-color: var(--mat-sys-primary, #6750A4); }
    }

    .reply-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px; }

    .load-more { display: flex; justify-content: center; margin-top: 24px; }
  `],
})
export class SalonReviewsComponent implements OnInit {
  private readonly reviewService = inject(ReviewService);
  private readonly adminService  = inject(SalonAdminService);
  private readonly snack         = inject(MatSnackBar);

  readonly reviews     = signal<Review[]>([]);
  readonly total       = signal(0);
  readonly isLoading   = signal(true);
  readonly isReplying  = signal(false);
  readonly replyOpenFor = signal<string | null>(null);

  replyText = '';

  private salonId  = '';
  private page     = 1;
  private readonly limit = 10;

  readonly hasMore = signal(false);

  ngOnInit(): void {
    this.adminService.getOwnSalon().subscribe({
      next: (salon) => {
        this.salonId = salon._id;
        this.fetchPage();
      },
      error: () => this.isLoading.set(false),
    });
  }

  starsFor(rating: number): boolean[] {
    return Array.from({ length: 5 }, (_, i) => i < Math.round(rating));
  }

  openReply(id: string): void {
    this.replyOpenFor.set(id);
    this.replyText = '';
  }

  closeReply(): void {
    this.replyOpenFor.set(null);
    this.replyText = '';
  }

  submitReply(review: Review): void {
    const reply = this.replyText.trim();
    if (!reply) return;
    this.isReplying.set(true);
    this.reviewService.replyToReview(review._id, { reply }).subscribe({
      next: (updated) => {
        this.reviews.update((list) =>
          list.map((r) => (r._id === updated._id ? updated : r)),
        );
        this.isReplying.set(false);
        this.closeReply();
        this.snack.open('Reply posted!', 'OK', { duration: 3000 });
      },
      error: () => {
        this.isReplying.set(false);
        this.snack.open('Failed to post reply.', 'Dismiss', { duration: 4000 });
      },
    });
  }

  loadMore(): void {
    this.page++;
    this.fetchPage();
  }

  private fetchPage(): void {
    this.isLoading.set(true);
    this.reviewService.getReviewsForSalon(this.salonId, this.page, this.limit).subscribe({
      next: (page) => {
        this.reviews.update((list) => [...list, ...page.data]);
        this.total.set(page.total);
        this.hasMore.set(this.reviews().length < page.total);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }
}
