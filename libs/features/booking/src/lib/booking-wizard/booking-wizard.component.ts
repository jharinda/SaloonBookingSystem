import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, filter, of, Subject, switchMap, tap } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs/operators';

import { Button } from 'primeng/button';
import { ProgressSpinner } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { Stepper, StepList, Step, StepPanels, StepPanel } from 'primeng/stepper';
import { DatePicker } from 'primeng/datepicker';
import { SelectButton } from 'primeng/selectbutton';
import { InputText } from 'primeng/inputtext';
import { Textarea } from 'primeng/textarea';
import { Checkbox } from 'primeng/checkbox';
import { Card } from 'primeng/card';
import { Message } from 'primeng/message';
import { FloatLabel } from 'primeng/floatlabel';
import { Divider } from 'primeng/divider';

import { Booking, BookingSlot, Salon, SalonServiceItem } from '@org/models';
import { BookingService, SalonService, UserService } from '@org/shared-data-access';

/** Display option for the time-slot SelectButton */
interface TimeSlotOption {
  label: string;
  value: string;
}

@Component({
  selector: 'lib-booking-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    Button,
    ProgressSpinner,
    Stepper,
    StepList,
    Step,
    StepPanels,
    StepPanel,
    DatePicker,
    SelectButton,
    InputText,
    Textarea,
    Checkbox,
    Card,
    Message,
    FloatLabel,
    Divider,
  ],
  templateUrl: './booking-wizard.component.html',
  styles: [`
    .wizard-container {
      max-width: 780px;
      margin: 0 auto;
      padding: 32px 24px 64px;
    }

    /* ── State panels ── */
    .wizard-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      padding: 80px 24px;
      text-align: center;
      color: #6b7280;
      font-size: 0.95rem;
    }
    .wizard-state--error { color: #ef4444; }

    /* ── Salon identity bar ── */
    .wizard-salon-bar {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 14px 18px;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 12px;
      margin-bottom: 28px;
    }
    .salon-bar-img {
      width: 54px; height: 54px;
      border-radius: 8px;
      object-fit: cover;
      flex-shrink: 0;
      background: #f0f0f0;
    }
    .salon-bar-info { min-width: 0; }
    .salon-bar-name {
      font-weight: 700;
      font-size: 1rem;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .salon-bar-city {
      display: flex;
      align-items: center;
      gap: 3px;
      font-size: 0.82rem;
      color: #6b7280;
      margin-top: 2px;
    }
    .inline-icon {
      font-size: 0.9rem;
      color: var(--p-primary-500, #7c3aed);
    }

    /* ── Dark mode overrides ── */
    :host-context(.dark) .wizard-salon-bar,
    :host-context(.app-dark) .wizard-salon-bar {
      background: #18181b;
      border-color: #3f3f46;
    }
    :host-context(.dark) .salon-bar-name,
    :host-context(.app-dark) .salon-bar-name {
      color: #f4f4f5;
    }
    :host-context(.dark) .salon-bar-city,
    :host-context(.app-dark) .salon-bar-city {
      color: #a1a1aa;
    }
    :host-context(.dark) .wizard-state,
    :host-context(.app-dark) .wizard-state {
      color: #a1a1aa;
    }
    :host-context(.dark) .summary-label,
    :host-context(.app-dark) .summary-label {
      color: #71717a;
    }
    :host-context(.dark) .summary-value,
    :host-context(.app-dark) .summary-value {
      color: #f4f4f5;
    }
    :host-context(.dark) .summary-icon,
    :host-context(.app-dark) .summary-icon {
      background: #3b0764;
    }

    /* ── Datepicker fills its column ── */
    :host ::ng-deep .fill-calendar { width: 100%; }
    :host ::ng-deep .fill-calendar .p-datepicker { width: 100%; }

    /* ── Time-slot SelectButton wrapping ── */
    :host ::ng-deep .time-slot-select .p-togglebutton { min-width: 72px; font-size: 0.85rem; }

    /* ── Summary rows ── */
    .summary-row {
      display: flex;
      align-items: flex-start;
      gap: 14px;
      padding: 10px 0;
    }
    .summary-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 36px; height: 36px;
      border-radius: 8px;
      background: #f3f0ff;
      color: var(--p-primary-600, #7c3aed);
      flex-shrink: 0;
    }
    .summary-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.07em; color: #9ca3af; font-weight: 500; }
    .summary-value { font-weight: 600; color: #111827; margin-top: 1px; }

    @media (max-width: 480px) {
      .wizard-container { padding: 16px; }
    }
  `],
})
export class BookingWizardComponent {
  // ── Injections ────────────────────────────────────────────────────────────────
  private readonly route          = inject(ActivatedRoute);
  private readonly router         = inject(Router);
  private readonly salonService   = inject(SalonService);
  private readonly bookingService = inject(BookingService);
  private readonly userService    = inject(UserService);
  private readonly msgSvc         = inject(MessageService);
  private readonly cdr            = inject(ChangeDetectorRef);

  // ── Async / loaded state (signals) ────────────────────────────────────────────
  readonly today = new Date();

  readonly salon          = signal<Salon | null>(null);
  readonly isSalonLoading = signal(true);
  readonly salonError     = signal<string | null>(null);

  /** Role from the authenticated user's JWT profile */
  readonly userRole = signal<string>('');

  readonly selectedService = signal<SalonServiceItem | null>(null);
  readonly stylistId       = signal<string>('');
  readonly stylistName     = signal<string>('');

  readonly isSlotsLoading = signal(false);
  readonly slotsError     = signal<string | null>(null);
  readonly isSubmitting   = signal(false);

  // ── Form / UI state (plain properties — two-way [(ngModel)] friendly) ─────────
  activeStep    = 0;
  selectedDate: Date | null = null;
  selectedTime: string | null = null;
  timeSlots: TimeSlotOption[] = [];

  fullName        = '';
  email           = '';
  phone           = '';
  specialRequests = '';
  agreeTerms      = false;

  // ── Getters ───────────────────────────────────────────────────────────────────
  get step1Valid(): boolean {
    return !!this.selectedDate && !!this.selectedTime;
  }

  get step2Valid(): boolean {
    return (
      this.fullName.trim().length > 0 &&
      this.email.trim().length > 0 &&
      this.phone.trim().length > 0 &&
      this.agreeTerms
    );
  }

  get selectedDateStr(): string | null {
    return this.selectedDate ? BookingWizardComponent._fmtDate(this.selectedDate) : null;
  }

  // ── RxJS pipeline for slot fetching ──────────────────────────────────────────
  private readonly dateTrigger$ = new Subject<string>();
  private lastDateStr = '';

  // ── Route param signal ────────────────────────────────────────────────────────
  private readonly salonId = toSignal(
    this.route.paramMap.pipe(map((p) => p.get('salonId') ?? '')),
    { initialValue: '' },
  );

  constructor() {
    // Read stylist info from query params synchronously
    const qp = this.route.snapshot.queryParamMap;
    const stylistIdParam   = qp.get('stylistId');
    const stylistNameParam = qp.get('stylistName');
    if (stylistIdParam)   this.stylistId.set(stylistIdParam);
    if (stylistNameParam) this.stylistName.set(stylistNameParam);

    // ── Salon load pipeline ──────────────────────────────────────────────────────
    toObservable(this.salonId)
      .pipe(
        filter((id) => !!id),
        switchMap((id) =>
          this.salonService.getSalonById(id).pipe(
            catchError(() => {
              this.salonError.set('Could not load salon details. Please go back and try again.');
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((salon) => {
        this.salon.set(salon);
        this.isSalonLoading.set(false);
        if (salon) this._resolveService(salon);
      });

    // ── Slot-fetch pipeline (switchMap cancels in-flight requests on new date) ───
    this.dateTrigger$
      .pipe(
        tap(() => {
          this.isSlotsLoading.set(true);
          this.slotsError.set(null);
          this.timeSlots = [];
          this.selectedTime = null;
        }),
        switchMap((dateStr) => {
          const salon   = this.salon();
          const service = this.selectedService();
          if (!salon || !service) return of({ date: dateStr, slots: [] as BookingSlot[] });
          return this.bookingService
            .getAvailableSlots(salon._id, dateStr, service.duration, this.stylistId() || undefined)
            .pipe(
              catchError(() => {
                this.slotsError.set('Could not load available slots. Please try another date.');
                return of({ date: dateStr, slots: [] as BookingSlot[] });
              }),
            );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((resp) => {
        this.timeSlots = resp.slots
          .filter((s: BookingSlot) => s.available)
          .map((s: BookingSlot) => ({ label: s.time, value: s.time }));
        this.isSlotsLoading.set(false);
        this.cdr.markForCheck();
      });

    // ── Pre-fill user details ────────────────────────────────────────────────────
    this.userService
      .getProfile()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (p) => {
          this.userRole.set(p.role);
          this.fullName = `${p.firstName} ${p.lastName}`.trim();
          this.email    = p.email;
          this.phone    = p.phone ?? '';
          this.cdr.markForCheck();
        },
        error: () => { /* silent — user can type manually */ },
      });
  }

  // ── Event handlers ────────────────────────────────────────────────────────────

  onDateChange(date: Date | null): void {
    // selectedDate already updated by [(ngModel)]; only handle side effects here
    this.selectedTime = null;
    if (!date) {
      this.timeSlots = [];
      this.cdr.markForCheck();
      return;
    }
    const dateStr = BookingWizardComponent._fmtDate(date);
    this.lastDateStr = dateStr;
    this.dateTrigger$.next(dateStr);
  }

  retrySlots(): void {
    if (this.lastDateStr) this.dateTrigger$.next(this.lastDateStr);
  }

  // ── Step navigation ───────────────────────────────────────────────────────────

  goToStep2(): void {
    if (!this.step1Valid) {
      this.msgSvc.add({ severity: 'warn', summary: 'Incomplete', detail: 'Please choose a date and a time slot.', life: 3000 });
      return;
    }
    this.activeStep = 1;
  }

  goToStep3(): void {
    if (!this.step2Valid) {
      this.msgSvc.add({ severity: 'warn', summary: 'Incomplete', detail: 'Please fill all required fields and accept the cancellation policy.', life: 3000 });
      return;
    }
    this.activeStep = 2;
  }

  goBack(): void {
    this.activeStep = Math.max(0, this.activeStep - 1);
  }

  // ── Booking submission ────────────────────────────────────────────────────────

  confirmBooking(): void {
    const salon   = this.salon();
    const service = this.selectedService();
    const dateStr = this.selectedDateStr;
    const time    = this.selectedTime;
    if (!salon || !service || !dateStr || !time) return;

    const role = this.userRole();
    if (role && role !== 'client') {
      this.msgSvc.add({
        severity: 'warn',
        summary: 'Bookings Not Available',
        detail: 'Only client accounts can make bookings. Please log in with a client account to continue.',
        life: 6000,
      });
      return;
    }

    this.isSubmitting.set(true);
    this.bookingService
      .createBooking({
        salonId:         salon._id,
        salonName:       salon.name,
        stylistId:       this.stylistId() || undefined,
        services: [{
          serviceId:       service._id,
          name:            service.name,
          price:           service.price,
          durationMinutes: service.duration,
        }],
        appointmentDate: dateStr,
        startTime:       time,
        notes:           this.specialRequests.trim() || undefined,
      })
      .subscribe({
        next: (booking: Booking) => {
          void this.router.navigate(['/booking', 'success', booking._id]);
        },
        error: (err) => {
          this.isSubmitting.set(false);
          const is403 = err?.status === 403;
          this.msgSvc.add({
            severity: is403 ? 'warn' : 'error',
            summary:  is403 ? 'Bookings Not Available' : 'Booking Failed',
            detail:   is403
              ? 'Only client accounts can make bookings. Please log in with a client account.'
              : 'Could not create booking. Please try again.',
            life: 6000,
          });
        },
      });
  }

  goToDiscover(): void {
    void this.router.navigate(['/discover']);
  }

  onImgError(event: Event): void {
    (event.target as HTMLImageElement).src = 'assets/images/salon-placeholder.svg';
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private _resolveService(salon: Salon): void {
    const serviceId = this.route.snapshot.queryParamMap.get('serviceId');
    if (serviceId) {
      const match = salon.services.find((s) => s._id === serviceId);
      if (match) { this.selectedService.set(match); return; }
    }
    // Fall back to the first service listed on the salon
    if (salon.services.length > 0) this.selectedService.set(salon.services[0]);
  }

  private static _fmtDate(d: Date): string {
    const y   = d.getFullYear();
    const m   = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
