import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe, NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';

import { ReviewService, SalonAdminService } from '@org/shared-data-access';
import { Review } from '@org/models';

@Component({
  selector: 'lib-salon-reviews',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgClass,
    FormsModule,
    Button,
    ProgressSpinner,
  ],
  template: `
    <div class="page-header">
      <h1 class="page-title">Reviews</h1>
      <p class="page-subtitle">{{ total() }} review{{ total() === 1 ? '' : 's' }} in total</p>
    </div>

    @if (isLoading() && reviews().length === 0) {
      <div class="state-center"><p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '36px', height: '36px' }" /></div>
    } @else if (reviews().length === 0) {
      <div class="state-center state--empty">
        <i class="pi pi-star" style="font-size:2.5rem;color:#d1d5db"></i>
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
                  <i class="pi pi-user avatar-icon"></i>
                }
              </div>
              <div class="reviewer-info">
                <div class="reviewer-name">{{ review.clientName }}</div>
                <div class="review-date">{{ review.createdAt | date: 'mediumDate' }}</div>
              </div>
              <div class="review-stars" [attr.aria-label]="review.rating + ' out of 5 stars'">
                @for (star of starsFor(review.rating); track $index) {
                  <i class="pi star" [class.star--filled]="star"
                     [ngClass]="star ? 'pi-star-fill' : 'pi-star'"></i>
                }
              </div>
            </div>

            <!-- Comment -->
            <p class="review-comment">{{ review.comment }}</p>

            <!-- Review images -->
            @if (review.images && review.images.length > 0) {
              <div class="review-images">
                @for (img of review.images; track img.cloudinaryId) {
                  <a [href]="img.url" target="_blank" rel="noopener noreferrer" class="review-img-link">
                    <img [src]="img.url" alt="Review photo" class="review-img" />
                  </a>
                }
              </div>
            }

            <!-- Existing reply -->
            @if (review.ownerReply) {
              <div class="owner-reply">
                <i class="pi pi-reply reply-icon"></i>
                <div>
                  <div class="reply-label">Your reply</div>
                  <p class="reply-text">{{ review.ownerReply }}</p>
                </div>
              </div>
            }

            <!-- Reply form toggle -->
            @if (!review.ownerReply && replyOpenFor() !== review._id) {
              <p-button label="Reply" icon="pi pi-reply" [outlined]="true" size="small" styleClass="reply-btn" (onClick)="openReply(review._id)" />
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
                  <p-button label="Cancel" [outlined]="true" severity="secondary" (onClick)="closeReply()" />
                  <p-button
                    label="Submit"
                    [disabled]="!replyText.trim() || isReplying()"
                    [loading]="isReplying()"
                    (onClick)="submitReply(review)"
                  />
                </div>
              </div>
            }

          </div>
        }
      </div>

      <!-- Pagination -->
      @if (hasMore()) {
        <div class="load-more">
          <p-button
            label="Load more"
            [outlined]="true"
            [disabled]="isLoading()"
            [loading]="isLoading()"
            (onClick)="loadMore()"
          />
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

    .review-images {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .review-img-link {
      display: block;
      width: 80px;
      height: 80px;
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
      border: 1px solid #e5e7eb;
    }

    .review-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: opacity .15s;

      &:hover { opacity: .85; }
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

    :host-context(.dark) {
      .page-title    { color: #f4f4f5; }
      .page-subtitle { color: #a1a1aa; }
      .review-card   { background: #18181b; border-color: #3f3f46; }
      .reviewer-avatar { background: #3f3f46; }
      .reviewer-name { color: #f4f4f5; }
      .review-date   { color: #71717a; }
      .review-comment { color: #d4d4d8; }
      .review-img-link { border-color: #3f3f46; }
      .owner-reply   { background: #27272a; }
      .reply-text    { color: #d4d4d8; }
      .reply-label   { color: #71717a; }
      .reply-textarea { background: #27272a; border-color: #52525b; color: #f4f4f5; color-scheme: dark; }
    }
  `],
})
export class SalonReviewsComponent implements OnInit {
  private readonly reviewService = inject(ReviewService);
  private readonly adminService  = inject(SalonAdminService);
  private readonly msgSvc        = inject(MessageService);

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
        this.msgSvc.add({ severity: 'success', summary: 'Done', detail: 'Reply posted!', life: 3000 });
      },
      error: () => {
        this.isReplying.set(false);
        this.msgSvc.add({ severity: 'error', summary: 'Error', detail: 'Failed to post reply.', life: 4000 });
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
