import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { catchError, of, Subject, switchMap, tap } from 'rxjs';

import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';

import { BookingSlot } from '@org/models';
import { BookingService } from '../services/booking.service';

interface SlotSelection {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  slot: string;
}

@Component({
  selector: 'lib-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, DatePicker, SelectButton, Card, Button],
  template: `
    <div class="step-header mb-6">
      <h2 class="text-xl font-bold text-gray-900 m-0 mb-1">Pick a Date &amp; Time</h2>
      <p class="text-sm text-gray-500 m-0">
        Choose when you'd like your
        <strong>{{ serviceLabel() }}</strong> appointment ({{ duration() }} min)
      </p>
    </div>

    <!-- Wrap calendar + slots in a PrimeNG Card -->
    <p-card styleClass="date-time-card">

      <!--  Inline Calendar  -->
      <div class="flex flex-col md:flex-row gap-8">
        <div class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold text-gray-700 m-0">Select a Date</h3>
          <p-datepicker
            [ngModel]="selectedDate()"
            (ngModelChange)="onDateChange($event)"
            [inline]="true"
            [minDate]="minDate"
            dateFormat="yy-mm-dd"
          />
          @if (selectedDate()) {
            <p class="text-sm text-gray-600 flex items-center gap-1.5 m-0">
              <i class="pi pi-calendar-check text-purple-500"></i>
              {{ selectedDate()! | date: 'EEEE, MMMM d, y' }}
            </p>
          }
        </div>

        <!--  Time Slots  -->
        @if (selectedDate()) {
          <div class="flex flex-col gap-3 flex-1">
            <h3 class="text-sm font-semibold text-gray-700 m-0">Available Times</h3>

            @if (isLoading()) {
              <div class="flex items-center gap-3 text-gray-500 text-sm py-4">
                <i class="pi pi-spin pi-spinner text-purple-500"></i>
                Checking availability
              </div>
            } @else if (slotsError()) {
              <div class="flex items-center flex-wrap gap-3 text-red-500 text-sm py-2">
                <i class="pi pi-exclamation-circle"></i>
                <span>{{ slotsError() }}</span>
                <p-button label="Retry" icon="pi pi-refresh" size="small" variant="outlined" (onClick)="retry()" />
              </div>
            } @else if (slots().length === 0) {
              <p class="text-gray-400 text-sm py-4 m-0">No slots available for this date. Please try another day.</p>
            } @else {
              <p-selectbutton
                [options]="slotOptions()"
                [ngModel]="selectedSlot()"
                (ngModelChange)="selectedSlot.set($event)"
                optionLabel="time"
                optionValue="time"
                optionDisabled="disabled"
                class="flex flex-wrap gap-2"
                aria-label="Available time slots"
              />
              <p class="text-xs text-gray-400 m-0">
                <span class="inline-block w-2 h-2 rounded-full bg-purple-500 mr-1"></span> Selected &nbsp;
                <span class="inline-block w-2 h-2 rounded-full bg-gray-200 mr-1 ml-3"></span> Available &nbsp;
                <span class="inline-block w-2 h-2 rounded-full bg-gray-100 border border-gray-200 mr-1 ml-3"></span> Booked
              </p>
            }
          </div>
        }
      </div>

    </p-card>

    <!-- Navigation -->
    <div class="flex justify-between items-center mt-6">
      <p-button label="Back" icon="pi pi-arrow-left" variant="outlined" (onClick)="back.emit()" />
      <p-button
        label="Continue"
        icon="pi pi-arrow-right"
        iconPos="right"
        [disabled]="!canContinue()"
        (onClick)="confirm()"
      />
    </div>
  `,
  styles: [`
    :host ::ng-deep .date-time-card .p-card-body {
      padding: 1.25rem;
    }

    :host ::ng-deep .p-selectbutton .p-togglebutton {
      min-width: 72px;
      font-size: 0.85rem;
    }
  `],
})
export class SlotPickerComponent {
  private readonly bookingService = inject(BookingService);

  //  Inputs / outputs 
  readonly salonId      = input.required<string>();
  readonly duration     = input.required<number>();
  readonly serviceLabel = input<string>('');

  readonly slotSelected = output<SlotSelection>();
  readonly back         = output<void>();

  //  State 
  readonly selectedDate = signal<Date | null>(null);
  readonly selectedSlot = signal<string | null>(null);
  readonly slots        = signal<BookingSlot[]>([]);
  readonly isLoading    = signal(false);
  readonly slotsError   = signal<string | null>(null);

  readonly minDate = new Date();

  //  Derived 
  readonly canContinue = computed(() => !!this.selectedDate() && !!this.selectedSlot());

  readonly slotOptions = computed(() =>
    this.slots().map((s) => ({ time: s.time, disabled: !s.available })),
  );

  //  RxJS pipeline 
  private lastDateStr = '';
  private readonly dateTrigger$ = new Subject<string>();

  constructor() {
    this.dateTrigger$
      .pipe(
        tap(() => {
          this.isLoading.set(true);
          this.slotsError.set(null);
          this.slots.set([]);
          this.selectedSlot.set(null);
        }),
        switchMap((dateStr) =>
          this.bookingService.getAvailableSlots(this.salonId(), dateStr, this.duration()).pipe(
            catchError((): ReturnType<BookingService['getAvailableSlots']> => {
              this.slotsError.set('Could not load slots. Please try again.');
              return of({ date: dateStr, slots: [] });
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((resp) => {
        this.slots.set(resp.slots);
        this.isLoading.set(false);
      });
  }

  onDateChange(date: Date | null): void {
    if (!date) return;
    this.selectedDate.set(date);
    const dateStr = formatDate(date);
    this.lastDateStr = dateStr;
    this.dateTrigger$.next(dateStr);
  }

  retry(): void {
    if (this.lastDateStr) this.dateTrigger$.next(this.lastDateStr);
  }

  confirm(): void {
    const date = this.selectedDate();
    const slot = this.selectedSlot();
    if (!date || !slot) return;
    this.slotSelected.emit({ date: formatDate(date), slot });
  }
}

//  Utilities 

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
