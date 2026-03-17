import {
  ChangeDetectionStrategy,
  Component,
  inject,
  computed,
  signal,
} from '@angular/core';
import { CardModule } from 'primeng/card';
import { ChipModule } from 'primeng/chip';

import { BookingStateService } from '../services/booking-state.service';
import { AppCurrencyPipe } from '@org/shared-data-access';
import { SalonServiceItem } from '@org/models';

/**
 * Step 1: Service Selection
 * - Single-select service cards
 * - Category filter chips
 * - Sticky bottom bar showing running total
 */
@Component({
  selector: 'lib-service-selection-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardModule,
    ChipModule,
    AppCurrencyPipe,
  ],
  templateUrl: './service-selection-step.component.html',
  styleUrl: './service-selection-step.component.scss',
})
export class ServiceSelectionStepComponent {
  private readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedServices = this.bookingState.selectedServices;
  readonly totalPrice = this.bookingState.totalPrice;
  readonly totalDuration = this.bookingState.totalDuration;

  readonly activeCategory = signal(''); // For future category filtering

  // ── Computed ─────────────────────────────────────────────────────────────────
  readonly services = computed(() => this.salon()?.services || []);

  readonly categories = computed(() => {
    const cats = new Set<string>();
    this.services().forEach((svc) => {
      if (svc.category) cats.add(svc.category);
    });
    return Array.from(cats).sort();
  });

  readonly filteredServices = computed(() => {
    const cat = this.activeCategory();
    if (!cat) return this.services();
    return this.services().filter((s) => s.category === cat);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────
  isSelected(service: SalonServiceItem): boolean {
    return this.selectedServices().some((s) => s._id === service._id);
  }

  toggleService(service: SalonServiceItem): void {
    this.bookingState.toggleService(service);
  }

  trackByServiceId(_index: number, service: SalonServiceItem): string {
    return service._id;
  }
}
