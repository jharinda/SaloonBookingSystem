import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Textarea } from 'primeng/textarea';
import { Toast } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';

import { ReviewService, ReviewImage } from '../services/review.service';
import { Booking } from '@org/models';

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'OK',
  4: 'Good',
  5: 'Excellent',
};

const MAX_IMAGES = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ImagePreview {
  file: File;
  previewUrl: string;
  uploaded?: ReviewImage;
}

@Component({
  selector: 'lib-submit-review',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [
    DatePipe,
    FormsModule,
    Button,
    ProgressSpinner,
    Textarea,
    Toast,
  ],
  template: `
    <p-toast position="top-right" />
    <div class="review-page">

      <!-- â”€â”€ Loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      @if (isLoading()) {
        <div class="review-state">
          <p-progressSpinner strokeWidth="3" animationDuration=".8s" [style]="{ width: '48px', height: '48px' }" />
          <p>Loading booking detailsâ€¦</p>
        </div>
      }

      <!-- â”€â”€ Load error â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      @if (!isLoading() && loadError()) {
        <div class="review-state review-state--error">
          <i class="pi pi-exclamation-circle" style="font-size:2rem;color:var(--p-red-500)"></i>
          <p>{{ loadError() }}</p>
          <p-button label="Go Back" (onClick)="goBack()" />
        </div>
      }

      <!-- â”€â”€ Booking not completed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      @if (!isLoading() && !loadError() && booking() && booking()!.status !== 'COMPLETED') {
        <div class="review-state review-state--error">
          <i class="pi pi-info-circle" style="font-size:2rem;color:var(--p-red-500)"></i>
          <p>You can only leave a review for completed appointments.</p>
          <p-button label="Go Back" (onClick)="goBack()" />
        </div>
      }

      <!-- â”€â”€ Success â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
      @if (submitted()) {
        <div class="review-state review-state--success">
          <span class="success-emoji">âœ…</span>
          <p>Thank you for your review!</p>
          <small>Redirecting you to your appointmentsâ€¦</small>
        </div>
      }

      <!-- â”€â”€ Form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ -->
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
              placeholder="Share your experienceâ€¦"
              class="comment-textarea"
            ></textarea>
            <small
              class="comment-hint"
              [class.warn-orange]="comment.length >= 400 && comment.length < 480"
              [class.warn-red]="comment.length >= 480"
            >{{ comment.length }} / 500</small>
          </div>

          <!-- Image upload -->
          <div class="images-field">
            <div class="images-header">
              <label class="images-label">Photos (optional)</label>
              <small class="images-hint">Up to {{ maxImages }} images · JPEG, PNG or WebP · max 10 MB each</small>
            </div>

            <!-- Hidden file input -->
            <input
              #fileInput
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              style="display:none"
              (change)="onFilesSelected($event)"
            />

            <!-- Preview grid -->
            @if (imagePreviews().length > 0) {
              <div class="image-grid">
                @for (preview of imagePreviews(); track preview.previewUrl; let i = $index) {
                  <div class="image-thumb">
                    <img [src]="preview.previewUrl" [alt]="'Image ' + (i + 1)" class="thumb-img" />
                    <button
                      type="button"
                      class="thumb-remove"
                      (click)="removeImage(i)"
                      title="Remove"
                      [disabled]="isSubmitting()"
                    >
                      <i class="pi pi-times"></i>
                    </button>
                    @if (isUploadingImages() && !preview.uploaded) {
                      <div class="thumb-uploading">
                        <i class="pi pi-spin pi-spinner"></i>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Upload drop-zone (visible when under the limit) -->
            @if (imagePreviews().length < maxImages) {
              <div
                class="upload-drop-zone"
                [class.upload-drop-zone--disabled]="isSubmitting()"
                (click)="!isSubmitting() && fileInput.click()"
                (keydown.enter)="!isSubmitting() && fileInput.click()"
                (keydown.space)="!isSubmitting() && fileInput.click()"
                tabindex="0"
                role="button"
                [attr.aria-label]="'Upload photos'"
              >
                <i class="pi pi-cloud-upload upload-zone-icon"></i>
                <p class="upload-zone-label">
                  {{ imagePreviews().length === 0 ? 'Click or drag &amp; drop photos here' : 'Add more photos' }}
                </p>
                <p class="upload-zone-hint">JPEG, PNG, WebP · max 10 MB · up to {{ maxImages }} images</p>
              </div>
            }
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

    /* ── Image upload ── */
    .images-field { display: flex; flex-direction: column; gap: 10px; }
    .images-header { display: flex; flex-direction: column; gap: 2px; }
    .images-label { font-weight: 500; font-size: .9rem; color: #374151; }
    .images-hint  { font-size: .75rem; color: #9ca3af; }

    .upload-drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 2px dashed #d1d5db;
      border-radius: 10px;
      padding: 24px 16px;
      cursor: pointer;
      background: #f9fafb;
      transition: border-color .2s, background .2s;
      outline: none;

      &:hover, &:focus {
        border-color: var(--p-primary-color, #6366f1);
        background: #f5f3ff;
      }
    }

    .upload-drop-zone--disabled {
      opacity: .5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .upload-zone-icon {
      font-size: 2rem;
      color: var(--p-primary-color, #6366f1);
    }

    .upload-zone-label {
      margin: 0;
      font-size: .9rem;
      font-weight: 500;
      color: #374151;
      text-align: center;
    }

    .upload-zone-hint {
      margin: 0;
      font-size: .75rem;
      color: #9ca3af;
      text-align: center;
    }

    .image-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .image-thumb {
      position: relative;
      width: 88px;
      height: 88px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
    }

    .thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumb-remove {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(0,0,0,.55);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      padding: 0;
      line-height: 1;

      &:hover { background: rgba(0,0,0,.8); }
      &:disabled { opacity: .5; cursor: not-allowed; }
    }

    .thumb-uploading {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
    }

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
  readonly maxImages = MAX_IMAGES;

  readonly isLoading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly booking = signal<Booking | null>(null);

  readonly hoveredRating = signal<number>(0);
  readonly selectedRating = signal<number>(0);

  readonly isSubmitting = signal(false);
  readonly isUploadingImages = signal(false);
  readonly submitted = signal(false);

  readonly imagePreviews = signal<ImagePreview[]>([]);

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

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const current = this.imagePreviews();
    const remaining = MAX_IMAGES - current.length;
    const files = Array.from(input.files).slice(0, remaining);

    const invalid = files.filter((f) => !ALLOWED_TYPES.includes(f.type));
    if (invalid.length) {
      this.msgSvc.add({
        severity: 'warn',
        summary: 'Invalid file',
        detail: `Only JPEG, PNG and WebP images are allowed.`,
        life: 4000,
      });
    }

    const valid = files.filter((f) => ALLOWED_TYPES.includes(f.type));

    const newPreviews: ImagePreview[] = valid.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    this.imagePreviews.update((prev) => [...prev, ...newPreviews]);
    // Reset so the same file can be re-selected after removal
    input.value = '';
  }

  removeImage(index: number): void {
    this.imagePreviews.update((prev) => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].previewUrl);
      copy.splice(index, 1);
      return copy;
    });
  }

  goBack(): void {
    this.router.navigate(['/my-appointments']);
  }

  submit(): void {
    const bookingId = this.route.snapshot.queryParamMap.get('bookingId') ?? '';
    const salonId = this.booking()?.salonId ?? '';
    this.isSubmitting.set(true);

    const previews = this.imagePreviews();

    // Upload all pending images first, then submit the review
    const uploads$ = previews.map((p)  =>
      p.uploaded ? of(p.uploaded) : this.reviewService.uploadImage(p.file),
    );

    const uploadAll$ = uploads$.length > 0 ? forkJoin(uploads$) : of([] as ReviewImage[]);

    this.isUploadingImages.set(uploads$.some((_, i) => !previews[i].uploaded));

    uploadAll$.subscribe({
      next: (images) => {
        this.isUploadingImages.set(false);
        // Cache uploaded results back onto previews
        this.imagePreviews.update((prev) =>
          prev.map((p, i) => ({ ...p, uploaded: images[i] })),
        );

        this.reviewService
          .createReview({
            salonId,
            bookingId,
            rating: this.selectedRating(),
            comment: this.comment,
            images: images.length ? images : undefined,
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
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.isUploadingImages.set(false);
        const msg = err?.error?.message ?? 'Failed to upload images. Please try again.';
        this.msgSvc.add({ severity: 'error', summary: 'Upload Error', detail: msg, life: 5000 });
      },
    });
  }
}
