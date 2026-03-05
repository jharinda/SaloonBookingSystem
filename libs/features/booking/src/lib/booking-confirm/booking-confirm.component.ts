import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Textarea } from 'primeng/textarea';
import { Divider } from 'primeng/divider';

import { BookingDraft } from '@org/models';

@Component({
  selector: 'lib-booking-confirm',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DecimalPipe, FormsModule, Card, Button, Dialog, Textarea, Divider],
  template: `
    <!-- Summary Card -->
    <div class="mb-5">
      <h2 class="text-xl font-bold text-gray-900 m-0 mb-1">Review Your Booking</h2>
      <p class="text-sm text-gray-500 m-0">Confirm the details below before booking</p>
    </div>

    <p-card styleClass="confirm-card mb-5">
      <!-- Salon -->
      <div class="flex items-start gap-4 py-2">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex-shrink-0">
          <i class="pi pi-shop text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-widest text-gray-400 font-medium">Salon</div>
          <div class="font-semibold text-gray-900">{{ draft().salon.name }}</div>
          <div class="text-sm text-gray-500">{{ draft().salon.address.city }}</div>
        </div>
      </div>
      <p-divider />
      <!-- Service -->
      <div class="flex items-start gap-4 py-2">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex-shrink-0">
          <i class="pi pi-sparkles text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-widest text-gray-400 font-medium">Service</div>
          <div class="font-semibold text-gray-900">{{ draft().service.name }}</div>
          <div class="text-sm text-gray-500">{{ draft().service.category }}  {{ draft().service.duration }} min</div>
        </div>
      </div>
      <p-divider />
      <!-- Date & Time -->
      <div class="flex items-start gap-4 py-2">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex-shrink-0">
          <i class="pi pi-calendar text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-widest text-gray-400 font-medium">Date &amp; Time</div>
          <div class="font-semibold text-gray-900">{{ draft().date | date: 'EEEE, MMMM d, y' }}</div>
          <div class="text-sm text-gray-500">Starting at <strong>{{ draft().slot }}</strong></div>
        </div>
      </div>
      <p-divider />
      <!-- Price -->
      <div class="flex items-start gap-4 py-2">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-purple-100 text-purple-600 flex-shrink-0">
          <i class="pi pi-wallet text-sm"></i>
        </div>
        <div class="min-w-0">
          <div class="text-xs uppercase tracking-widest text-gray-400 font-medium">Total</div>
          <div class="font-bold text-lg text-purple-600">LKR {{ draft().service.price | number }}</div>
          <div class="text-sm text-gray-500">Pay at salon</div>
        </div>
      </div>
    </p-card>

    <!-- Notes -->
    <div class="mb-6">
      <label for="booking-notes" class="block text-sm font-medium text-gray-700 mb-1.5">
        Notes <span class="text-gray-400 font-normal">(optional)</span>
      </label>
      <textarea
        pTextarea
        id="booking-notes"
        rows="3"
        maxlength="300"
        placeholder="Any special requests or information for the stylist..."
        class="w-full"
        [ngModel]="notes()"
        (ngModelChange)="notes.set($event)"
      ></textarea>
      <div class="text-xs text-gray-400 text-right mt-1">{{ notes().length }}/300</div>
    </div>

    <!-- Step Actions -->
    <div class="flex justify-between items-center">
      <p-button label="Back" icon="pi pi-arrow-left" variant="outlined" [disabled]="isSubmitting()" (onClick)="back.emit()" />
      <p-button label="Review and Confirm" icon="pi pi-check-circle" [disabled]="isSubmitting()" (onClick)="openConfirmDialog()" />
    </div>

    <!-- Confirmation Dialog -->
    <p-dialog
      header="Confirm Your Booking"
      [(visible)]="confirmVisible"
      [modal]="true"
      [closable]="!isSubmitting()"
      [style]="{ width: '26rem' }"
      [draggable]="false"
      [resizable]="false"
    >
      <div class="flex flex-col gap-3 py-2">
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Service</span>
          <span class="font-semibold text-gray-900">{{ draft().service.name }}</span>
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Date</span>
          <span class="font-semibold text-gray-900">{{ draft().date | date: 'EEE, MMM d, y' }}</span>
        </div>
        <div class="flex justify-between items-center text-sm">
          <span class="text-gray-500">Time</span>
          <span class="font-semibold text-gray-900">{{ draft().slot }}</span>
        </div>
        <div class="flex justify-between items-center text-sm border-t border-gray-100 pt-2 mt-1">
          <span class="text-gray-700 font-medium">Total</span>
          <span class="font-bold text-purple-600 text-base">LKR {{ draft().service.price | number }}</span>
        </div>
      </div>
      <ng-template #footer>
        <div class="flex gap-3 justify-end">
          <p-button label="Cancel" variant="outlined" severity="secondary" [disabled]="isSubmitting()" (onClick)="closeConfirmDialog()" />
          <p-button label="Confirm Booking" icon="pi pi-check" [loading]="isSubmitting()" (onClick)="onConfirm()" />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .confirm-card .p-card-body { padding: 0.75rem 1.25rem; }
    :host ::ng-deep .confirm-card .p-card-content { padding: 0; }
    :host ::ng-deep .p-divider { margin: 0; }

    :host-context(.app-dark) {
      h2 { color: #f4f4f5; }
      .text-gray-900 { color: #f4f4f5; }
      .text-gray-700 { color: #d4d4d8; }
      .text-gray-500 { color: #a1a1aa; }
      .text-gray-400 { color: #71717a; }
      .bg-purple-100 { background-color: rgba(139,92,246,.15) !important; }
      .border-gray-100 { border-color: #3f3f46; }
    }
  `],
})
export class BookingConfirmComponent {
  readonly draft        = input.required<BookingDraft>();
  readonly isSubmitting = input<boolean>(false);

  readonly confirm = output<string>();
  readonly back    = output<void>();

  readonly notes = signal('');
  confirmVisible = false;

  openConfirmDialog(): void  { this.confirmVisible = true; }
  closeConfirmDialog(): void { this.confirmVisible = false; }

  onConfirm(): void {
    this.confirm.emit(this.notes());
  }
}