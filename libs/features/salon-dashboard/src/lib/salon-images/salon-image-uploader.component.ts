import {
  ChangeDetectionStrategy,
  Component,
  inject,
  input,
  output,
  signal,
  computed,
} from '@angular/core';
import { NgClass } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { BadgeModule } from 'primeng/badge';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { FileUploadModule, FileUploadHandlerEvent } from 'primeng/fileupload';
import { MessageService } from 'primeng/api';

import { SalonAdminService, SalonImage } from '@org/shared-data-access';

const MAX_IMAGES = 10;
const MAX_SIZE_MB = 5;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

@Component({
  selector: 'lib-salon-image-uploader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [MessageService],
  imports: [
    NgClass,
    ButtonModule,
    BadgeModule,
    ToastModule,
    ProgressSpinnerModule,
    TooltipModule,
    FileUploadModule,
  ],
  template: `
    <p-toast position="top-right" />

    <!-- ── Upload area ──────────────────────────────────────────────────── -->
    @if (images().length < maxImages) {
      <p-fileupload
        name="file"
        accept="image/*"
        [maxFileSize]="maxSizeBytes"
        [multiple]="true"
        [customUpload]="true"
        (uploadHandler)="onUploadHandler($event)"
        [disabled]="uploadingCount() > 0"
        chooseLabel="Choose Images"
        [showUploadButton]="true"
        uploadLabel="Upload"
        [showCancelButton]="true"
        styleClass="image-uploader"
      >
        <ng-template pTemplate="empty">
          <div class="upload-drop-zone">
            @if (uploadingCount() > 0) {
              <p-progressSpinner
                strokeWidth="3"
                animationDuration=".8s"
                [style]="{ width: '36px', height: '36px' }"
              />
              <p class="upload-hint">Uploading {{ uploadingCount() }} file{{ uploadingCount() === 1 ? '' : 's' }}…</p>
            } @else {
              <i class="pi pi-cloud-upload upload-icon"></i>
              <p class="upload-hint">Drag & drop images here, or click <strong>Choose Images</strong></p>
              <p class="upload-subhint">JPG, PNG, WebP · max {{ maxSizeMb }}MB per file · up to {{ maxImages }} images total</p>
            }
          </div>
        </ng-template>
      </p-fileupload>
    } @else {
      <div class="upload-limit-banner">
        <i class="pi pi-info-circle"></i>
        Maximum of {{ maxImages }} images reached. Remove one to add more.
      </div>
    }

    <!-- ── Image grid ────────────────────────────────────────────────────── -->
    @if (images().length > 0) {
      <div class="image-grid">
        @for (img of images(); track img.cloudinaryId) {
          <div class="image-tile" [ngClass]="{ 'image-tile--primary': img.isPrimary }">

            <!-- Thumbnail -->
            <img
              [src]="img.url"
              [alt]="'Salon image'"
              class="image-thumb"
              loading="lazy"
            />

            <!-- Primary badge -->
            @if (img.isPrimary) {
              <span class="primary-badge">
                <i class="pi pi-star-fill"></i> Primary
              </span>
            }

            <!-- Per-tile uploading spinner overlay -->
            @if (uploadingIds().has(img.cloudinaryId)) {
              <div class="tile-overlay">
                <p-progressSpinner strokeWidth="4" animationDuration=".8s" [style]="{ width: '28px', height: '28px' }" />
              </div>
            }

            <!-- Actions -->
            <div class="tile-actions">
              @if (!img.isPrimary) {
                <button
                  pButton
                  type="button"
                  icon="pi pi-star"
                  class="p-button-sm p-button-rounded p-button-text p-button-warning"
                  pTooltip="Set as primary"
                  tooltipPosition="top"
                  (click)="onSetPrimary(img)"
                  [disabled]="isWorking()"
                  aria-label="Set as primary image"
                ></button>
              }
              <button
                pButton
                type="button"
                icon="pi pi-trash"
                class="p-button-sm p-button-rounded p-button-text p-button-danger"
                pTooltip="Remove image"
                tooltipPosition="top"
                (click)="onRemove(img)"
                [disabled]="isWorking()"
                aria-label="Remove image"
              ></button>
            </div>
          </div>
        }
      </div>
    } @else if (uploadingCount() === 0) {
      <div class="empty-state">
        <i class="pi pi-images empty-icon"></i>
        <p>No images yet. Upload your first salon photo above.</p>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }

    /* ── Drop zone ─────────────────────────────────────────────── */
    .upload-drop-zone {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      padding: 2rem 1rem;
      color: var(--p-text-muted-color, #6b7280);
    }
    .upload-icon {
      font-size: 2.5rem;
      color: var(--p-primary-color, #6366f1);
      margin-bottom: .25rem;
    }
    .upload-hint    { margin: 0; font-size: .95rem; text-align: center; }
    .upload-subhint { margin: 0; font-size: .8rem;  text-align: center; opacity: .75; }

    /* ── Limit banner ──────────────────────────────────────────── */
    .upload-limit-banner {
      display: flex;
      align-items: center;
      gap: .5rem;
      padding: .75rem 1rem;
      border-radius: .5rem;
      background: var(--p-surface-100, #f3f4f6);
      color: var(--p-text-muted-color, #6b7280);
      font-size: .875rem;
      margin-bottom: 1rem;
    }

    /* ── Grid ──────────────────────────────────────────────────── */
    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 1rem;
      margin-top: 1.25rem;
    }

    .image-tile {
      position: relative;
      border-radius: .75rem;
      overflow: hidden;
      border: 2px solid var(--p-surface-200, #e5e7eb);
      background: var(--p-surface-50, #f9fafb);
      transition: border-color .2s;
    }
    .image-tile--primary {
      border-color: var(--p-primary-color, #6366f1);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--p-primary-color, #6366f1) 20%, transparent);
    }

    .image-thumb {
      width: 100%;
      aspect-ratio: 1 / 1;
      object-fit: cover;
      display: block;
    }

    /* ── Primary badge ─────────────────────────────────────────── */
    .primary-badge {
      position: absolute;
      top: .4rem;
      left: .4rem;
      display: flex;
      align-items: center;
      gap: .25rem;
      padding: .2rem .5rem;
      border-radius: 999px;
      background: var(--p-primary-color, #6366f1);
      color: #fff;
      font-size: .7rem;
      font-weight: 600;
      line-height: 1.4;
      pointer-events: none;
    }

    /* ── Spinner overlay ───────────────────────────────────────── */
    .tile-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,.35);
      border-radius: .75rem;
    }

    /* ── Tile action buttons ───────────────────────────────────── */
    .tile-actions {
      position: absolute;
      bottom: .4rem;
      right: .4rem;
      display: flex;
      gap: .25rem;
      opacity: 0;
      transition: opacity .2s;
    }
    .image-tile:hover .tile-actions { opacity: 1; }

    /* ── Empty state ───────────────────────────────────────────── */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: .5rem;
      padding: 2.5rem 1rem;
      color: var(--p-text-muted-color, #9ca3af);
      margin-top: .5rem;
    }
    .empty-icon { font-size: 2.5rem; }
    .empty-state p { margin: 0; font-size: .9rem; }
  `],
})
export class SalonImageUploaderComponent {
  // ── Inputs ─────────────────────────────────────────────────────────────────
  readonly salonId = input.required<string>();
  readonly initialImages = input<SalonImage[]>([]);

  // ── Outputs ────────────────────────────────────────────────────────────────
  readonly imagesChanged = output<SalonImage[]>();

  // ── Constants ──────────────────────────────────────────────────────────────
  readonly maxImages   = MAX_IMAGES;
  readonly maxSizeMb   = MAX_SIZE_MB;
  readonly maxSizeBytes = MAX_SIZE_BYTES;

  // ── Services ───────────────────────────────────────────────────────────────
  private readonly adminService  = inject(SalonAdminService);
  private readonly messageService = inject(MessageService);

  // ── State ──────────────────────────────────────────────────────────────────
  /** Structured image list, seeded from the parent-supplied initialImages */
  readonly images = signal<SalonImage[]>([]);

  /** Number of files currently being uploaded */
  readonly uploadingCount = signal(0);

  /** cloudinaryIds currently being mutated (set-primary / delete) */
  readonly uploadingIds = signal<Set<string>>(new Set());

  /** True while any async operation is in flight */
  readonly isWorking = computed(() => this.uploadingCount() > 0 || this.uploadingIds().size > 0);

  constructor() {
    // Seed the images signal once the input is resolved
    // Using an effect-like initializer via ngOnInit pattern; Angular input() values
    // are available after construction so we read them in ngOnInit.
  }

  ngOnInit(): void {
    this.images.set([...(this.initialImages() ?? [])]);
  }

  // ── Upload handler ─────────────────────────────────────────────────────────
  onUploadHandler(event: FileUploadHandlerEvent): void {
    const files = Array.from(event.files ?? []) as File[];
    if (!files.length) return;

    const remaining = MAX_IMAGES - this.images().length;
    const toUpload  = files.slice(0, remaining);

    if (files.length > remaining) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Limit reached',
        detail: `Only ${remaining} image${remaining === 1 ? '' : 's'} can be added. The rest were skipped.`,
      });
    }

    const oversized = toUpload.filter((f) => f.size > MAX_SIZE_BYTES);
    if (oversized.length) {
      this.messageService.add({
        severity: 'error',
        summary: 'File too large',
        detail: `${oversized.map((f) => f.name).join(', ')} exceed${oversized.length === 1 ? 's' : ''} the ${MAX_SIZE_MB}MB limit.`,
      });
    }

    const valid = toUpload.filter((f) => f.size <= MAX_SIZE_BYTES);
    if (!valid.length) return;

    this.uploadingCount.update((n) => n + valid.length);

    valid.forEach((file) => {
      this.adminService.uploadSalonImage(this.salonId(), file).subscribe({
        next: (salon) => {
          const updated = salon.images ?? [];
          this.images.set(updated);
          this.imagesChanged.emit(updated);
          this.messageService.add({
            severity: 'success',
            summary: 'Uploaded',
            detail: `"${file.name}" uploaded successfully.`,
            life: 3000,
          });
        },
        error: (err) => {
          console.error('Image upload failed', err);
          this.messageService.add({
            severity: 'error',
            summary: 'Upload failed',
            detail: err?.error?.message ?? `Could not upload "${file.name}". Please try again.`,
          });
        },
        complete: () => this.uploadingCount.update((n) => Math.max(0, n - 1)),
      });
    });
  }

  // ── Set primary ────────────────────────────────────────────────────────────
  onSetPrimary(img: SalonImage): void {
    this.markWorking(img.cloudinaryId);
    this.adminService.setPrimaryImage(this.salonId(), img.cloudinaryId).subscribe({
      next: (salon) => {
        const updated = salon.images ?? [];
        this.images.set(updated);
        this.imagesChanged.emit(updated);
        this.messageService.add({
          severity: 'success',
          summary: 'Primary set',
          detail: 'Cover image updated.',
          life: 3000,
        });
      },
      error: (err) => {
        console.error('Set primary failed', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'Could not set primary image.',
        });
      },
      complete: () => this.unmarkWorking(img.cloudinaryId),
    });
  }

  // ── Remove ─────────────────────────────────────────────────────────────────
  onRemove(img: SalonImage): void {
    this.markWorking(img.cloudinaryId);
    this.adminService.removeImage(this.salonId(), img.cloudinaryId).subscribe({
      next: (salon) => {
        const updated = salon.images ?? [];
        this.images.set(updated);
        this.imagesChanged.emit(updated);
        this.messageService.add({
          severity: 'success',
          summary: 'Image removed',
          detail: 'The image has been deleted.',
          life: 3000,
        });
      },
      error: (err) => {
        console.error('Remove image failed', err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.error?.message ?? 'Could not remove image.',
        });
      },
      complete: () => this.unmarkWorking(img.cloudinaryId),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  private markWorking(id: string): void {
    this.uploadingIds.update((s) => new Set([...s, id]));
  }

  private unmarkWorking(id: string): void {
    this.uploadingIds.update((s) => {
      const next = new Set(s);
      next.delete(id);
      return next;
    });
  }
}
