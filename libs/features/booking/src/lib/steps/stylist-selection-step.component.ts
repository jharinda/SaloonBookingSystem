import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatRadioModule } from '@angular/material/radio';
import { MatIconModule } from '@angular/material/icon';

import { BookingStateService } from '../services/booking-state.service';

/**
 * Placeholder interface for staff members (to be defined later)
 * TODO: Create proper Staff model when backend supports staff management
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
    MatCardModule,
    MatRadioModule,
    MatIconModule,
  ],
  templateUrl: './stylist-selection-step.component.html',
  styleUrl: './stylist-selection-step.component.scss',
})
export class StylistSelectionStepComponent {
  private readonly bookingState = inject(BookingStateService);

  // ── State ────────────────────────────────────────────────────────────────────
  readonly salon = this.bookingState.salon;
  readonly selectedStylistId = this.bookingState.selectedStylistId;

  // TODO: Replace with actual staff data from salon service
  readonly staffMembers: StaffMember[] = [];

  // ── Methods ──────────────────────────────────────────────────────────────────
  selectStylist(stylistId: string | null): void {
    this.bookingState.selectStylist(stylistId);
  }

  trackByStaffId(_index: number, staff: StaffMember): string {
    return staff._id;
  }
}
