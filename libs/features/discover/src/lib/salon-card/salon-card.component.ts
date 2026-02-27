import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import { Salon, SalonServiceItem } from '@org/models';

type StarType = 'full' | 'half' | 'empty';

@Component({
  selector: 'lib-salon-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule],
  template: `
    <mat-card class="salon-card" appearance="outlined">
      <!-- Cover image -->
      <div class="card-image-wrapper">
        <img
          class="card-image"
          [src]="coverImage()"
          [alt]="salon().name"
          loading="lazy"
          (error)="onImgError($event)"
        />
        @if (!salon().isActive || !salon().isApproved) {
          <div class="card-badge card-badge--closed">Closed</div>
        }
      </div>

      <mat-card-header>
        <mat-card-title class="card-title">{{ salon().name }}</mat-card-title>
        <mat-card-subtitle class="card-subtitle">
          <mat-icon class="inline-icon" aria-hidden="true">location_on</mat-icon>
          {{ salon().address.city }}
        </mat-card-subtitle>
      </mat-card-header>

      <mat-card-content>
        <!-- Star rating -->
        <div class="rating-row" [attr.aria-label]="'Rated ' + salon().rating + ' out of 5'">
          @for (star of stars(); track $index) {
            <mat-icon
              class="star-icon"
              [class.star--full]="star === 'full'"
              [class.star--half]="star === 'half'"
              [class.star--empty]="star === 'empty'"
              aria-hidden="true"
            >
              {{ star === 'full' ? 'star' : star === 'half' ? 'star_half' : 'star_border' }}
            </mat-icon>
          }
          <span class="rating-value">{{ salon().rating | number: '1.1-1' }}</span>
          <span class="review-count">({{ salon().reviewCount }})</span>
        </div>

        <!-- Top 3 services -->
        <ul class="services-list" aria-label="Featured services">
          @for (svc of topServices(); track svc._id) {
            <li class="service-item">
              <span class="service-name">{{ svc.name }}</span>
              <span class="service-price">LKR {{ svc.price | number }}</span>
            </li>
          }
          @if (salon().services.length > 3) {
            <li class="service-more">+{{ salon().services.length - 3 }} more services</li>
          }
        </ul>
      </mat-card-content>

      <mat-card-actions align="end">
        <button
          mat-raised-button
          color="primary"
          [disabled]="!salon().isActive || !salon().isApproved"
          [matTooltip]="salon().isActive && salon().isApproved ? '' : 'This salon is currently unavailable'"
          (click)="onBookNow()"
          aria-label="Book an appointment at {{ salon().name }}"
        >
          <mat-icon>calendar_today</mat-icon>
          Book Now
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .salon-card {
      display: flex;
      flex-direction: column;
      height: 100%;
      transition: box-shadow 0.25s ease, transform 0.25s ease;
      cursor: default;
    }

    .salon-card:hover {
      transform: translateY(-3px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
    }

    /* ── Image ── */
    .card-image-wrapper {
      position: relative;
      width: 100%;
      aspect-ratio: 16 / 9;
      overflow: hidden;
      background: #f0f0f0;
    }

    .card-image {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transition: transform 0.3s ease;
    }

    .salon-card:hover .card-image {
      transform: scale(1.04);
    }

    .card-badge {
      position: absolute;
      top: 10px;
      left: 10px;
      padding: 3px 10px;
      border-radius: 12px;
      font-size: 0.72rem;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .card-badge--closed {
      background: rgba(0, 0, 0, 0.55);
      color: #fff;
    }

    /* ── Header ── */
    mat-card-header {
      padding: 12px 16px 0;
    }

    .card-title {
      font-size: 1rem;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .card-subtitle {
      display: flex;
      align-items: center;
      gap: 2px;
      font-size: 0.82rem;
    }

    .inline-icon {
      font-size: 0.95rem;
      width: 0.95rem;
      height: 0.95rem;
      line-height: 0.95rem;
      color: var(--mat-sys-primary, #6750A4);
    }

    /* ── Rating ── */
    .rating-row {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-bottom: 12px;
    }

    .star-icon {
      font-size: 1.05rem;
      width: 1.05rem;
      height: 1.05rem;
      line-height: 1.05rem;
    }

    .star--full,
    .star--half {
      color: #f59e0b;
    }

    .star--empty {
      color: #d1d5db;
    }

    .rating-value {
      font-weight: 600;
      font-size: 0.9rem;
      margin-left: 4px;
    }

    .review-count {
      font-size: 0.82rem;
      color: #6b7280;
    }

    /* ── Services ── */
    .services-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .service-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.85rem;
      padding: 5px 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .service-item:last-of-type {
      border-bottom: none;
    }

    .service-name {
      color: #374151;
    }

    .service-price {
      font-weight: 600;
      color: var(--mat-sys-primary, #6750A4);
      white-space: nowrap;
    }

    .service-more {
      font-size: 0.8rem;
      color: #9ca3af;
      padding-top: 2px;
    }

    /* ── Actions ── */
    mat-card-actions {
      padding: 8px 16px 12px;
    }

    button[mat-raised-button] mat-icon {
      font-size: 1rem;
      width: 1rem;
      height: 1rem;
      margin-right: 4px;
    }
  `],
})
export class SalonCardComponent {
  readonly salon = input.required<Salon>();
  readonly bookNow = output<Salon>();

  /** First image URL or a fallback placeholder */
  readonly coverImage = computed(
    () => this.salon().images?.[0] ?? 'assets/images/salon-placeholder.jpg',
  );

  /** Top 3 services by price (ascending) */
  readonly topServices = computed<SalonServiceItem[]>(() =>
    this.salon().services.slice(0, 3),
  );

  /** 5-element array of star types derived from the salon's rating */
  readonly stars = computed<StarType[]>(() => {
    const rating = this.salon().rating;
    return Array.from({ length: 5 }, (_, i): StarType => {
      if (rating >= i + 1) return 'full';
      if (rating >= i + 0.5) return 'half';
      return 'empty';
    });
  });

  onBookNow(): void {
    this.bookNow.emit(this.salon());
  }

  /** Replace broken image with placeholder */
  onImgError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/images/salon-placeholder.jpg';
  }
}
