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
import { forkJoin, of } from 'rxjs';

import { CreateReviewDto, ReviewImage } from '@org/models';
import { ReviewService } from '@org/shared-data-access';

const MAX_IMAGES   = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface ImagePreview {
  file: File;
  previewUrl: string;
  uploaded?: ReviewImage;
}

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

      <!-- Image upload -->
      <div class="images-section">
        <p class="images-label">Photos <span class="images-label-opt">(optional)</span></p>

        <!-- Hidden file input -->
        <input
          #fileInput
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          style="display:none"
          (change)="onFilesSelected($event)"
        />

        <!-- Thumbnails -->
        @if (imagePreviews().length > 0) {
          <div class="thumb-grid">
            @for (preview of imagePreviews(); track preview.previewUrl; let i = $index) {
              <div class="thumb-tile">
                <img [src]="preview.previewUrl" [alt]="'Photo ' + (i + 1)" class="thumb-img" />
                @if (uploadingImages() && !preview.uploaded) {
                  <div class="thumb-spinner"><i class="pi pi-spin pi-spinner"></i></div>
                }
                <button
                  type="button"
                  class="thumb-remove"
                  (click)="removeImage(i)"
                  title="Remove"
                  [disabled]="submitting()"
                ><i class="pi pi-times"></i></button>
              </div>
            }
          </div>
        }

        <!-- Drop zone -->
        @if (imagePreviews().length < MAX_IMAGES) {
          <div
            class="drop-zone"
            [class.drop-zone--disabled]="submitting()"
            (click)="!submitting() && fileInput.click()"
            (keydown.enter)="!submitting() && fileInput.click()"
            (keydown.space)="!submitting() && fileInput.click()"
            tabindex="0"
            role="button"
            aria-label="Upload photos"
          >
            <i class="pi pi-cloud-upload drop-zone-icon"></i>
            <span class="drop-zone-label">
              {{ imagePreviews().length === 0 ? 'Click to add photos' : 'Add more' }}
            </span>
            <span class="drop-zone-hint">JPEG · PNG · WebP · max 10 MB · up to {{ MAX_IMAGES }}</span>
          </div>
        }
      </div>
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

    /* ── Image upload ── */
    .images-section {
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .images-label {
      font-size: .85rem;
      font-weight: 500;
      color: #374151;
      margin: 0;
    }

    .images-label-opt {
      font-weight: 400;
      color: #9ca3af;
    }

    .thumb-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .thumb-tile {
      position: relative;
      width: 72px;
      height: 72px;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      flex-shrink: 0;
    }

    .thumb-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .thumb-spinner {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,.35);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 18px;
    }

    .thumb-remove {
      position: absolute;
      top: 3px;
      right: 3px;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(0,0,0,.55);
      color: #fff;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      padding: 0;
      line-height: 1;

      &:hover { background: rgba(0,0,0,.8); }
      &:disabled { opacity: .45; cursor: not-allowed; }
    }

    .drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      border: 2px dashed #d1d5db;
      border-radius: 10px;
      padding: 16px 12px;
      cursor: pointer;
      background: #f9fafb;
      transition: border-color .2s, background .2s;
      outline: none;

      &:hover, &:focus {
        border-color: var(--p-primary-color, #6366f1);
        background: #f5f3ff;
      }
    }

    .drop-zone--disabled {
      opacity: .5;
      cursor: not-allowed;
      pointer-events: none;
    }

    .drop-zone-icon {
      font-size: 1.6rem;
      color: var(--p-primary-color, #6366f1);
    }

    .drop-zone-label {
      font-size: .85rem;
      font-weight: 500;
      color: #374151;
    }

    .drop-zone-hint {
      font-size: .72rem;
      color: #9ca3af;
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
      .images-label { color: #d4d4d8; }
      .drop-zone { background: #27272a; border-color: #52525b; &:hover, &:focus { background: #3f3f46; border-color: var(--p-primary-color, #818cf8); } }
      .drop-zone-label { color: #d4d4d8; }
      .thumb-tile { border-color: #3f3f46; }
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
  readonly MAX_IMAGES = MAX_IMAGES;
  readonly rating     = signal(0);
  readonly hovered    = signal(0);
  readonly submitting  = signal(false);
  readonly uploadingImages = signal(false);
  readonly imagePreviews   = signal<ImagePreview[]>([]);

  comment = '';

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files) return;

    const remaining = MAX_IMAGES - this.imagePreviews().length;
    const files = Array.from(input.files).slice(0, remaining);

    const valid = files.filter((f) => ALLOWED_TYPES.includes(f.type));
    const invalid = files.filter((f) => !ALLOWED_TYPES.includes(f.type));

    if (invalid.length) {
      this.msgSvc.add({ severity: 'warn', summary: 'Invalid file', detail: 'Only JPEG, PNG and WebP images are allowed.', life: 4000 });
    }

    this.imagePreviews.update((prev) => [
      ...prev,
      ...valid.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
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

  ratingLabel(): string {
    const v = this.hovered() || this.rating();
    return ['', 'Poor', 'Fair', 'Good', 'Very Good', 'Excellent'][v] ?? '';
  }

  submit(): void {
    if (this.rating() === 0) return;

    this.submitting.set(true);

    const previews = this.imagePreviews();
    const uploads$ = previews.map((p) =>
      p.uploaded ? of(p.uploaded) : this.reviewService.uploadReviewImage(p.file),
    );
    const uploadAll$ = uploads$.length > 0 ? forkJoin(uploads$) : of([] as ReviewImage[]);

    if (uploads$.some((_, i) => !previews[i].uploaded)) {
      this.uploadingImages.set(true);
    }

    uploadAll$.subscribe({
      next: (images) => {
        this.uploadingImages.set(false);
        this.imagePreviews.update((prev) =>
          prev.map((p, i) => ({ ...p, uploaded: images[i] })),
        );

        const dto: CreateReviewDto = {
          salonId:   this.data.salonId,
          bookingId: this.data.bookingId,
          stylistId: this.data.stylistId,
          rating:    this.rating(),
          comment:   this.comment.trim() || undefined,
          images:    images.length ? images : undefined,
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
      },
      error: (err) => {
        this.submitting.set(false);
        this.uploadingImages.set(false);
        const msg = err?.error?.message ?? 'Failed to upload images. Please try again.';
        this.msgSvc.add({ severity: 'error', summary: 'Upload Error', detail: msg, life: 5000 });
      },
    });
  }

  dismiss(): void {
    this.ref.close(undefined);
  }
}
