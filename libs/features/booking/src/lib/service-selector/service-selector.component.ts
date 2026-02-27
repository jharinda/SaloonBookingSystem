import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRippleModule } from '@angular/material/core';

import { Salon, SalonServiceItem } from '@org/models';

@Component({
  selector: 'lib-service-selector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, MatButtonModule, MatIconModule, MatRippleModule],
  template: `
    <div class="service-selector">
      <p class="selector-hint">
        Choose a service to book at <strong>{{ salon().name }}</strong>
      </p>

      <!-- Category filter tabs -->
      @if (categories().length > 1) {
        <div class="category-tabs" role="tablist" aria-label="Filter by category">
          <button
            class="category-tab"
            [class.category-tab--active]="activeCategory() === ''"
            role="tab"
            [attr.aria-selected]="activeCategory() === ''"
            (click)="activeCategory.set('')"
          >All</button>

          @for (cat of categories(); track cat) {
            <button
              class="category-tab"
              [class.category-tab--active]="activeCategory() === cat"
              role="tab"
              [attr.aria-selected]="activeCategory() === cat"
              (click)="activeCategory.set(cat)"
            >{{ cat }}</button>
          }
        </div>
      }

      <!-- Service grid -->
      <div
        class="service-grid"
        role="listbox"
        [attr.aria-label]="'Services at ' + salon().name"
      >
        @for (svc of filteredServices(); track svc._id) {
          <div
            class="service-card"
            [class.service-card--selected]="selected()?._id === svc._id"
            role="option"
            [attr.aria-selected]="selected()?._id === svc._id"
            tabindex="0"
            matRipple
            (click)="select(svc)"
            (keyup.enter)="select(svc)"
            (keyup.space)="select(svc)"
          >
            <div class="service-card__header">
              <span class="service-card__name">{{ svc.name }}</span>
              @if (selected()?._id === svc._id) {
                <mat-icon class="service-card__check" aria-hidden="true">
                  check_circle
                </mat-icon>
              }
            </div>

            @if (svc.description) {
              <p class="service-card__desc">{{ svc.description }}</p>
            }

            <div class="service-card__meta">
              <span class="service-card__duration">
                <mat-icon aria-hidden="true">schedule</mat-icon>
                {{ svc.duration }} min
              </span>
              <span class="service-card__price">LKR {{ svc.price | number }}</span>
            </div>
          </div>
        }

        @if (filteredServices().length === 0) {
          <p class="no-services">No services found in this category.</p>
        }
      </div>

      <!-- Continue -->
      <div class="selector-footer">
        <button
          mat-raised-button
          color="primary"
          [disabled]="!selected()"
          (click)="confirm()"
        >
          Continue <mat-icon iconPositionEnd>arrow_forward</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .service-selector {
      display: flex;
      flex-direction: column;
      gap: 20px;
      padding: 8px 0 16px;
    }

    .selector-hint { margin: 0; color: #5f6368; font-size: 0.95rem; }

    /* ── Category tabs ── */
    .category-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .category-tab {
      padding: 6px 16px;
      border-radius: 20px;
      border: 1.5px solid #e0e0e0;
      background: #fff;
      font-size: 0.85rem;
      cursor: pointer;
      transition: all 0.18s ease;
      white-space: nowrap;
      color: #374151;
    }

    .category-tab:hover { border-color: var(--mat-sys-primary, #6750A4); }

    .category-tab--active {
      background: var(--mat-sys-primary, #6750A4);
      color: #fff;
      border-color: var(--mat-sys-primary, #6750A4);
    }

    /* ── Service grid ── */
    .service-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 12px;
    }

    /* ── Service card ── */
    .service-card {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border: 2px solid #e5e7eb;
      border-radius: 10px;
      background: #fff;
      cursor: pointer;
      transition: border-color 0.2s, box-shadow 0.2s;
      user-select: none;
    }

    .service-card:hover { border-color: #9ca3af; box-shadow: 0 2px 8px rgba(0,0,0,.08); }

    .service-card--selected {
      border-color: var(--mat-sys-primary, #6750A4);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--mat-sys-primary, #6750A4) 15%, transparent);
      background: color-mix(in srgb, var(--mat-sys-primary, #6750A4) 4%, white);
    }

    .service-card__header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 8px;
    }

    .service-card__name {
      font-weight: 600;
      font-size: 0.93rem;
      color: #111827;
    }

    .service-card__check {
      font-size: 1.15rem;
      width: 1.15rem;
      height: 1.15rem;
      color: var(--mat-sys-primary, #6750A4);
      flex-shrink: 0;
    }

    .service-card__desc {
      font-size: 0.78rem;
      color: #6b7280;
      margin: 0;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .service-card__meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-top: auto;
    }

    .service-card__duration {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 0.78rem;
      color: #6b7280;
    }

    .service-card__duration mat-icon {
      font-size: 0.85rem;
      width: 0.85rem;
      height: 0.85rem;
    }

    .service-card__price {
      font-size: 0.93rem;
      font-weight: 700;
      color: var(--mat-sys-primary, #6750A4);
      white-space: nowrap;
      flex-shrink: 0;
    }

    .no-services {
      color: #9ca3af;
      font-size: 0.9rem;
      padding: 24px 0;
      grid-column: 1 / -1;
    }

    /* ── Footer ── */
    .selector-footer {
      display: flex;
      justify-content: flex-end;
      padding-top: 4px;
    }

    @media (max-width: 480px) {
      .service-grid { grid-template-columns: 1fr; }
    }
  `],
})
export class ServiceSelectorComponent {
  readonly salon            = input.required<Salon>();
  readonly serviceSelected  = output<SalonServiceItem>();

  readonly activeCategory = signal<string>('');
  readonly selected       = signal<SalonServiceItem | null>(null);

  readonly categories = computed<string[]>(() => {
    const seen = new Set<string>();
    const cats: string[] = [];
    for (const s of this.salon().services) {
      if (!seen.has(s.category)) {
        seen.add(s.category);
        cats.push(s.category);
      }
    }
    return cats;
  });

  readonly filteredServices = computed<SalonServiceItem[]>(() => {
    const cat = this.activeCategory();
    return cat
      ? this.salon().services.filter((s) => s.category === cat)
      : this.salon().services;
  });

  select(svc: SalonServiceItem): void {
    this.selected.set(svc);
  }

  confirm(): void {
    const svc = this.selected();
    if (svc) this.serviceSelected.emit(svc);
  }
}
