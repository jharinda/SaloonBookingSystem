import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { RadioButtonModule } from 'primeng/radiobutton';

import { BookingStateService } from '../services/booking-state.service';

/**
 * Placeholder interface for staff members (to be defined later)
 */
interface StaffMember {
  _id: string;
  name: string;
  avatar?: string;
  rating?: number;
  specialties?: string[];
}

/**
 * Step 2: Stylist Selection
 * - "Any available stylist" option (default, null stylistId)
 * - Staff member cards with avatar/name/rating/specialties
 * - Single-select with ring border highlight
 * - Material Design UI
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
  ],
  templateUrl: './stylist-selection-step.component.html',
  styleUrl: './stylist-selection-step.component.scss',
})
export class StylistSelectionStepComponent {
  private readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedStylistId = this.bookingState.selectedStylistId;

  readonly staffMembers: StaffMember[] = [];
  readonly hasStaff = computed(() => this.staffMembers.length > 0);

  constructor() {
    // Auto-select "Any available" when there is no staff
    if (this.staffMembers.length === 0) {
      this.bookingState.selectStylist(null); // null = any available
    }
  }

  // ── Methods ──────────────────────────────────────────────────────────────────
  selectStylist(stylistId: string | null): void {
    this.bookingState.selectStylist(stylistId);
  }

  trackByStaffId(_index: number, staff: StaffMember): string {
    return staff._id;
  }
}
