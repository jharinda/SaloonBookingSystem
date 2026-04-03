import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { RadioButtonModule } from 'primeng/radiobutton';
import { ProgressSpinner } from 'primeng/progressspinner';
import { AvatarModule } from 'primeng/avatar';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { TranslateModule } from '@ngx-translate/core';

import { BookingStateService } from '../services/booking-state.service';
import { BookingService, SalonService, SalonStaffDto } from '@org/shared-data-access';

/**
 * Step 3: Stylist Selection (after Date & Time)
 * - "Any available stylist" option (default, null stylistId)
 * - Staff member cards with avatar/name/rating/specialties
 * - Stylists on break at the selected time slot are shown disabled
 * - Single-select with ring border highlight
 */
@Component({
  selector: 'lib-stylist-selection-step',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DecimalPipe,
    FormsModule,
    CardModule,
    RadioButtonModule,
    ProgressSpinner,
    AvatarModule,
    TagModule,
    TooltipModule,
    TranslateModule,
  ],
  templateUrl: './stylist-selection-step.component.html',
  styleUrl: './stylist-selection-step.component.scss',
})
export class StylistSelectionStepComponent implements OnInit {
  private readonly bookingState = inject(BookingStateService);
  private readonly salonService = inject(SalonService);
  private readonly bookingService = inject(BookingService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedStylistId = this.bookingState.selectedStylistId;

  readonly staffMembers = signal<SalonStaffDto[]>([]);
  readonly onBreakStylistIds = signal<Set<string>>(new Set());
  readonly loadingStaff = signal(false);

  /** Available stylists (no break) sorted first, on-break sorted last */
  readonly sortedStaffMembers = computed(() => {
    const breakIds = this.onBreakStylistIds();
    const staff = this.staffMembers();
    const available = staff.filter((s) => !breakIds.has(s._id));
    const onBreak   = staff.filter((s) =>  breakIds.has(s._id));
    return [...available, ...onBreak];
  });

  readonly hasStaff = computed(() => this.staffMembers().length > 0);

  constructor() {
    // Re-fetch break data whenever the selected date or time changes.
    // This handles the case where the user goes back to step 2 and picks a
    // different time slot, then returns to step 3 (ngOnInit won't re-fire
    // because PrimeNG stepper keeps components alive after first render).
    effect(() => {
      const date = this.bookingState.selectedDate();
      const time = this.bookingState.selectedTime();
      const salonId = this.bookingState.salon()?._id;

      if (date && time && salonId) {
        this.fetchBreakData(salonId);
      }
    });
  }

  ngOnInit(): void {
    const salon = this.salon();
    if (salon?._id) {
      this.loadingStaff.set(true);
      this.salonService.getSalonStaff(salon._id).subscribe({
        next: (staff) => {
          this.staffMembers.set(staff);
          this.loadingStaff.set(false);
          if (staff.length === 0) {
            this.bookingState.selectStylist(null);
          }
          // Break data is fetched reactively via effect() – no manual call needed here
        },
        error: () => {
          this.loadingStaff.set(false);
          this.bookingState.selectStylist(null);
        },
      });
    } else {
      this.bookingState.selectStylist(null);
    }
  }

  private fetchBreakData(salonId: string): void {
    // Use the selected booking date (always available since Date & Time is now step 2)
    const bookingDate = this.bookingState.selectedDate();
    const bookingTime = this.bookingState.selectedTime();
    const duration = this.bookingState.totalDuration();

    const dateStr = bookingDate
      ? this.formatDateStr(bookingDate)
      : this.formatDateStr(new Date());

    this.bookingService.getStylistsOnBreak(
      salonId,
      dateStr,
      bookingTime || undefined,
      duration || undefined,
    ).subscribe({
      next: (ids) => this.onBreakStylistIds.set(new Set(ids)),
      error: () => { /* non-fatal: silently ignore */ },
    });
  }

  private formatDateStr(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // ── Methods ──────────────────────────────────────────────────────────────────
  selectStylist(stylistId: string | null, isOnBreak = false): void {
    if (isOnBreak) return;
    this.bookingState.selectStylist(stylistId);
  }

  isOnBreak(stylistId: string): boolean {
    return this.onBreakStylistIds().has(stylistId);
  }

  getStaffName(staff: SalonStaffDto): string {
    return `${staff.firstName} ${staff.lastName}`;
  }

  getStaffInitials(staff: SalonStaffDto): string {
    return `${staff.firstName.charAt(0)}${staff.lastName.charAt(0)}`.toUpperCase();
  }
}
