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
import { catchError, finalize, of, Subject, switchMap, tap } from 'rxjs';

import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';

import { BookingSlot } from '@org/models';
import { BookingService } from '../services/booking.service';
import { WaitlistService, JoinWaitlistPayload } from '@org/shared-data-access';

interface SlotSelection {
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:mm" */
  slot: string;
}

@Component({
  selector: 'lib-slot-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, DatePipe, DatePicker, SelectButton, Card, Button, Dialog],
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
              <div class="flex flex-col gap-3 py-4">
                <p class="text-gray-400 text-sm m-0">No slots available for this date.</p>
                @if (selectedDateStr()) {
                  <p-button
                    label="Join Waitlist"
                    icon="pi pi-bell"
                    severity="secondary"
                    variant="outlined"
                    size="small"
                    (onClick)="openWaitlistDialog()"
                  />
                }
              </div>
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
                <span class="inline-block w-2 h-2 rounded-full bg-gray-200 mr-1 ml-3"></span> Available
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

    <!-- Waitlist Dialog -->
    <p-dialog
      header="Join the Waitlist"
      [modal]="true"
      [(visible)]="waitlistDialogVisible"
      [style]="{ width: '24rem' }"
      [draggable]="false"
    >
      @if (waitlistSuccess()) {
        <div class="flex flex-col items-center gap-4 py-4 text-center">
          <i class="pi pi-check-circle text-green-500 text-5xl"></i>
          <p class="text-gray-700 m-0">
            You're on the waitlist! We'll notify you by email and push notification
            as soon as a slot opens up.
          </p>
          <p-button label="Close" (onClick)="waitlistDialogVisible.set(false)" />
        </div>
      } @else {
        <div class="flex flex-col gap-4">
          <p class="text-gray-600 text-sm m-0">
            All slots are fully booked for
            <strong>{{ selectedDate()! | date: 'EEEE, MMMM d' }}</strong>.
            Join the waitlist and we'll notify you the moment a slot becomes available.
          </p>
          <div class="text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
            <p class="m-0 font-semibold text-gray-700 mb-1">How it works</p>
            <ul class="list-disc list-inside m-0 space-y-1">
              <li>We watch for cancellations on your chosen date.</li>
              <li>You'll get an email and a push notification instantly.</li>
              <li>Head back to book before the slot fills again!</li>
            </ul>
          </div>
          @if (waitlistError()) {
            <p class="text-red-500 text-sm m-0">{{ waitlistError() }}</p>
          }
          <div class="flex gap-2 justify-end">
            <p-button
              label="Cancel"
              severity="secondary"
              variant="outlined"
              (onClick)="waitlistDialogVisible.set(false)"
            />
            <p-button
              label="Notify Me"
              icon="pi pi-bell"
              [loading]="waitlistLoading()"
              (onClick)="submitWaitlist()"
            />
          </div>
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    :host ::ng-deep .date-time-card .p-card-body {
      padding: 1.25rem;
    }

    :host ::ng-deep .p-selectbutton .p-togglebutton {
      min-width: 72px;
      font-size: 0.85rem;
    }

    :host-context(.app-dark) {
      h2 { color: #f4f4f5; }
      .text-gray-900 { color: #f4f4f5; }
      .text-gray-700 { color: #d4d4d8; }
      .text-gray-600, .text-gray-500 { color: #a1a1aa; }
      .text-gray-400 { color: #71717a; }
      .bg-gray-200 { background-color: #3f3f46 !important; }
      .bg-gray-100 { background-color: #27272a !important; }
      .border-gray-200 { border-color: #3f3f46; }
    }
  `],
})
export class SlotPickerComponent {
  private readonly bookingService = inject(BookingService);
  private readonly waitlistService = inject(WaitlistService);

  //  Inputs / outputs
  readonly salonId      = input.required<string>();
  readonly duration     = input.required<number>();
  readonly serviceLabel = input<string>('');
  /** Services selected in a prior wizard step — used to build the waitlist payload. */
  readonly services     = input<Array<{ serviceId: string; name: string; price: number; durationMinutes: number }>>([]);

  readonly slotSelected = output<SlotSelection>();
  readonly back         = output<void>();

  //  State
  readonly selectedDate = signal<Date | null>(null);
  readonly selectedSlot = signal<string | null>(null);
  readonly slots        = signal<BookingSlot[]>([]);
  readonly isLoading    = signal(false);
  readonly slotsError   = signal<string | null>(null);

  /** YYYY-MM-DD string derived from selectedDate */
  readonly selectedDateStr = computed(() => {
    const d = this.selectedDate();
    return d ? formatDate(d) : null;
  });

  // ── Waitlist state ───────────────────────────────────────────────────────
  readonly waitlistDialogVisible = signal(false);
  readonly waitlistLoading       = signal(false);
  readonly waitlistSuccess       = signal(false);
  readonly waitlistError         = signal<string | null>(null);

  readonly minDate = new Date();

  //  Derived
  readonly canContinue = computed(() => !!this.selectedDate() && !!this.selectedSlot());

  readonly slotOptions = computed(() => {
    const now = new Date();
    const date = this.selectedDate();
    const isToday = date
      ? date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      : false;

    return this.slots()
      .filter((s) => {
        // Remove booked / unavailable slots
        if (!s.available) return false;

        // Remove past time slots when the selected date is today
        if (isToday) {
          const [hours, minutes] = s.time.split(':').map(Number);
          const slotMinutes = hours * 60 + minutes;
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          if (slotMinutes <= nowMinutes) return false;
        }

        return true;
      })
      .map((s) => ({ time: s.time, disabled: false }));
  });

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

  // ── Waitlist ─────────────────────────────────────────────────────────────

  openWaitlistDialog(): void {
    this.waitlistSuccess.set(false);
    this.waitlistError.set(null);
    this.waitlistDialogVisible.set(true);
  }

  submitWaitlist(): void {
    const dateStr = this.selectedDateStr();
    if (!dateStr) return;

    const totalDurationMinutes = this.duration();
    // Derive a sensible default preferred window: the full working day.
    // If services are provided, we use their total duration for the end time.
    const preferredStartTime = '08:00';
    const endMin = 8 * 60 + totalDurationMinutes;
    const preferredEndTime = `${String(Math.floor(endMin / 60)).padStart(2, '0')}:${String(endMin % 60).padStart(2, '0')}`;

    const payload: JoinWaitlistPayload = {
      salonId: this.salonId(),
      appointmentDate: dateStr,
      preferredStartTime,
      preferredEndTime,
      services: this.services().length > 0
        ? this.services()
        : [{ serviceId: 'unknown', name: this.serviceLabel() || 'Service', price: 0, durationMinutes: totalDurationMinutes }],
    };

    this.waitlistLoading.set(true);
    this.waitlistError.set(null);

    this.waitlistService.joinWaitlist(payload).pipe(
      finalize(() => this.waitlistLoading.set(false)),
    ).subscribe({
      next: () => this.waitlistSuccess.set(true),
      error: (err: { error?: { message?: string } }) => {
        this.waitlistError.set(
          err?.error?.message ?? 'Could not join the waitlist. Please try again.',
        );
      },
    });
  }
}

//  Utilities

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
