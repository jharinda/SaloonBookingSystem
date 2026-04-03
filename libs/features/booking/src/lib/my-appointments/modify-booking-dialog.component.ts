import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { Button } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { Textarea } from 'primeng/textarea';
import { ProgressSpinner } from 'primeng/progressspinner';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

import { Booking, SalonServiceItem } from '@org/models';
import { AppCurrencyPipe, SalonService } from '@org/shared-data-access';

export interface ModifyBookingDialogData {
  booking: Booking;
}

export interface ModifyBookingDialogResult {
  /** Replacement service list selected by the user */
  services: SalonServiceItem[];
  notes: string;
}

@Component({
  selector: 'lib-modify-booking-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    Button,
    Checkbox,
    Textarea,
    ProgressSpinner,
    AppCurrencyPipe,
  ],
  template: `
    <div class="dlg-body">

      @if (loadingServices()) {
        <div class="loading-wrap">
          <p-progressSpinner strokeWidth="4" styleClass="w-8 h-8" />
        </div>
      }

      @if (!loadingServices() && serviceLoadError()) {
        <p class="error-msg">{{ serviceLoadError() }}</p>
      }

      @if (!loadingServices() && !serviceLoadError()) {

        <!-- Services checkboxes -->
        <h4 class="section-label">Services</h4>
        <div class="service-list">
          @for (svc of availableServices(); track svc._id) {
            <label class="service-row">
              <p-checkbox
                [binary]="true"
                [(ngModel)]="checkedMap[svc._id]"
                (ngModelChange)="onCheckChange()"
              />
              <span class="svc-name">{{ svc.name }}</span>
              <span class="svc-meta">{{ svc.duration }} min</span>
              <span class="svc-price">{{ svc.price | appCurrency }}</span>
            </label>
          }
        </div>

        @if (noneSelected()) {
          <p class="validation-hint">Please select at least one service.</p>
        }

        <!-- Notes -->
        <h4 class="section-label mt">Notes</h4>
        <textarea
          pTextarea
          [(ngModel)]="notes"
          rows="3"
          placeholder="Any special requests?"
          maxlength="500"
          class="notes-textarea"
        ></textarea>

        <!-- Live total -->
        <div class="total-row">
          <span class="total-label">Estimated total</span>
          <strong class="total-amount">{{ totalPrice() | appCurrency }}</strong>
        </div>
      }
    </div>

    <div class="dlg-actions">
      <p-button label="Cancel" [text]="true" (onClick)="dismiss()" />
      <p-button
        label="Save Changes"
        [disabled]="noneSelected() || loadingServices()"
        (onClick)="confirm()"
      />
    </div>
  `,
  styles: [`
    .dlg-body { padding: 0; min-height: 120px; }

    .loading-wrap {
      display: flex;
      justify-content: center;
      padding: 24px 0;
    }

    .error-msg {
      color: #dc2626;
      font-size: .9rem;
      margin-bottom: 12px;
    }

    .section-label {
      font-size: .875rem;
      font-weight: 600;
      color: #374151;
      margin: 0 0 8px;
      &.mt { margin-top: 16px; }
    }

    .service-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 4px;
    }

    .service-row {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      cursor: pointer;
      transition: background .15s;

      &:hover { background: #f9fafb; }
    }

    .svc-name { flex: 1; font-size: .9rem; }
    .svc-meta { font-size: .8rem; color: #6b7280; }
    .svc-price { font-size: .875rem; font-weight: 600; color: #6750a4; }

    .validation-hint {
      font-size: .8rem;
      color: #dc2626;
      margin-top: 4px;
    }

    .notes-textarea { width: 100%; resize: vertical; }

    .total-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
    }

    .total-label { font-size: .9rem; color: #374151; }
    .total-amount { font-size: 1.1rem; color: #6750a4; }

    .dlg-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    :host-context(.app-dark) {
      .section-label { color: #d4d4d8; }
      .service-row {
        border-color: #3f3f46;
        &:hover { background: #27272a; }
      }
      .svc-name { color: #e4e4e7; }
      .total-row { border-color: #3f3f46; }
      .total-label { color: #a1a1aa; }
    }
  `],
})
export class ModifyBookingDialogComponent implements OnInit {
  private readonly ref    = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);
  private readonly salonSvc = inject(SalonService);

  readonly data = this.config.data as ModifyBookingDialogData;

  readonly loadingServices = signal(true);
  readonly serviceLoadError = signal<string | null>(null);
  readonly availableServices = signal<SalonServiceItem[]>([]);

  /** Track checkbox state per service _id */
  checkedMap: Record<string, boolean> = {};
  notes = this.data.booking.notes ?? '';

  readonly totalPrice = signal(0);

  readonly noneSelected = computed(() => {
    const svcs = this.availableServices();
    return svcs.length > 0 && !svcs.some((s) => this.checkedMap[s._id]);
  });

  ngOnInit(): void {
    this.salonSvc.getSalonById(this.data.booking.salonId).subscribe({
      next: (salon) => {
        const active = (salon.services ?? []).filter((s) => s.active !== false);
        this.availableServices.set(active);

        // Pre-select currently booked services
        const currentIds = new Set(this.data.booking.services.map((s) => s.serviceId));
        for (const svc of active) {
          this.checkedMap[svc._id] = currentIds.has(svc._id);
        }

        this.loadingServices.set(false);
        this.recalcTotal();
      },
      error: () => {
        this.serviceLoadError.set('Could not load salon services. Please try again.');
        this.loadingServices.set(false);
      },
    });
  }

  onCheckChange(): void {
    this.recalcTotal();
  }

  private recalcTotal(): void {
    const sum = this.availableServices()
      .filter((s) => this.checkedMap[s._id])
      .reduce((acc, s) => acc + s.price, 0);
    this.totalPrice.set(sum);
  }

  confirm(): void {
    const selected = this.availableServices().filter((s) => this.checkedMap[s._id]);
    if (selected.length === 0) return;

    this.ref.close({
      services: selected,
      notes: this.notes,
    } satisfies ModifyBookingDialogResult);
  }

  dismiss(): void {
    this.ref.close(undefined);
  }
}
