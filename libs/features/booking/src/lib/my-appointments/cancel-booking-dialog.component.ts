import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

export interface CancelDialogData {
  salonName: string;
  serviceName: string;
}

export interface CancelDialogResult {
  confirmed: boolean;
  reason: string;
}

@Component({
  selector: 'lib-cancel-booking-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>Cancel Appointment</h2>

    <mat-dialog-content>
      <p class="confirm-msg">
        Are you sure you want to cancel your
        <strong>{{ data.serviceName }}</strong> appointment at
        <strong>{{ data.salonName }}</strong>?
        <br />
        <span class="warn-text">Cancellations cannot be undone.</span>
      </p>

      <mat-form-field appearance="outline" class="reason-field">
        <mat-label>Reason (optional)</mat-label>
        <textarea
          matInput
          [(ngModel)]="reason"
          rows="3"
          placeholder="Let the salon know why you're cancelling..."
          maxlength="300"
          aria-label="Cancellation reason"
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Keep Appointment</button>
      <button
        mat-flat-button
        class="cancel-confirm-btn"
        (click)="confirm()"
        aria-label="Confirm cancellation"
      >
        Yes, Cancel It
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .confirm-msg {
      font-size: .95rem;
      line-height: 1.5;
      margin-bottom: 16px;
    }
    .warn-text {
      color: #dc2626;
      font-weight: 600;
      font-size: .875rem;
    }
    .reason-field { width: 100%; }
    .cancel-confirm-btn {
      background: #dc2626;
      color: #fff;
    }
  `],
})
export class CancelBookingDialogComponent {
  readonly data = inject<CancelDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef = inject(MatDialogRef<CancelBookingDialogComponent>);

  reason = '';

  confirm(): void {
    this.dialogRef.close({ confirmed: true, reason: this.reason } satisfies CancelDialogResult);
  }
}
