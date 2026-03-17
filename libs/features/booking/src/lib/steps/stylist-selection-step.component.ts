import {
  ChangeDetectionStrategy,
  Component,
  computed,
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

import { BookingStateService } from '../services/booking-state.service';
import { BookingService, SalonService, SalonStaffDto } from '@org/shared-data-access';

/**
 * Step 2: Stylist Selection
 * - "Any available stylist" option (default, null stylistId)
 * - Staff member cards with avatar/name/rating/specialties
 * - On-break stylists are shown disabled at the end of the list
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
          // After loading staff, fetch break data for the relevant date
          this.fetchBreakData(salon._id);
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
    // Use the booking date if already selected, otherwise use today
    const bookingDate = this.bookingState.selectedDate();
    const dateStr = bookingDate
      ? this.formatDateStr(bookingDate)
      : this.formatDateStr(new Date());

    this.bookingService.getStylistsOnBreak(salonId, dateStr).subscribe({
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
