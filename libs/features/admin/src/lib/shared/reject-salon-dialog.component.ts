import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

export interface RejectSalonDialogData {
  salonName: string;
}

export interface RejectSalonDialogResult {
  confirmed: boolean;
  reason:    string;
}

@Component({
  selector: 'lib-reject-salon-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
  ],
  template: `
    <div class="dlg-wrap">
      <div class="dlg-head">
        <mat-icon class="warn-icon">block</mat-icon>
        <h2 mat-dialog-title>Reject Salon</h2>
      </div>

      <mat-dialog-content>
        <p class="dlg-msg">
          You are rejecting <strong>{{ data.salonName }}</strong>.
          Please provide a reason that will be sent to the salon owner.
        </p>
        <mat-form-field appearance="outline" class="full">
          <mat-label>Rejection Reason</mat-label>
          <textarea
            matInput
            rows="3"
            [(ngModel)]="reason"
            placeholder="e.g. Incomplete information, misleading details…"
          ></textarea>
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button (click)="cancel()">Cancel</button>
        <button
          mat-flat-button
          class="reject-btn"
          [disabled]="!reason().trim()"
          (click)="confirm()"
        >Reject Salon</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dlg-wrap { padding: 8px; min-width: 360px; max-width: 480px; }
    .dlg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .warn-icon { color: #dc2626; font-size: 26px; width: 26px; height: 26px; }
    h2[mat-dialog-title] { margin: 0; font-size: 1.15rem; font-weight: 700; }
    .dlg-msg { color: #4b5563; font-size: .9rem; line-height: 1.6; }
    .full { width: 100%; }
    .reject-btn { background: #dc2626 !important; color: #fff !important; border-radius: 6px; }
    button[disabled] { opacity: .45 !important; }
  `],
})
export class RejectSalonDialogComponent {
  readonly data   = inject<RejectSalonDialogData>(MAT_DIALOG_DATA);
  readonly reason = signal('');
  private readonly dialogRef = inject(MatDialogRef<RejectSalonDialogComponent>);

  cancel():  void { this.dialogRef.close({ confirmed: false, reason: '' }   satisfies RejectSalonDialogResult); }
  confirm(): void { this.dialogRef.close({ confirmed: true,  reason: this.reason() } satisfies RejectSalonDialogResult); }
}
