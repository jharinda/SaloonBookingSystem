import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

@Component({
  selector: 'lib-delete-account-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="dialog-wrap">
      <div class="dialog-header">
        <mat-icon class="warn-icon">warning</mat-icon>
        <h2 mat-dialog-title>Delete Account</h2>
      </div>

      <mat-dialog-content>
        <p class="warning-text">
          This action is <strong>permanent and irreversible</strong>. All your
          bookings, reviews, and personal data will be deleted immediately.
        </p>
        <p class="confirm-label">
          Type <strong>DELETE</strong> below to confirm:
        </p>
        <mat-form-field appearance="outline" class="confirm-field">
          <input
            matInput
            [(ngModel)]="confirmText"
            placeholder="Type DELETE to confirm"
            autocomplete="off"
          />
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">Cancel</button>
        <button
          mat-flat-button
          class="delete-btn"
          [disabled]="confirmText() !== 'DELETE'"
          (click)="confirm()"
        >
          Delete My Account
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dialog-wrap { padding: 8px; max-width: 420px; }
    .dialog-header { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .warn-icon { color: #dc2626; font-size: 28px; width: 28px; height: 28px; }
    h2[mat-dialog-title] { margin: 0; font-size: 1.2rem; font-weight: 700; }
    .warning-text { color: #4b5563; font-size: .9rem; line-height: 1.6; }
    .confirm-label { font-size: .875rem; margin-bottom: 8px; }
    .confirm-field { width: 100%; }
    .delete-btn {
      background: #dc2626 !important;
      color: #fff !important;
      border-radius: 6px;
    }
    .delete-btn[disabled] { opacity: .45 !important; }
  `],
})
export class DeleteAccountDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<DeleteAccountDialogComponent>);

  readonly confirmText = signal('');

  confirm(): void {
    if (this.confirmText() === 'DELETE') {
      this.dialogRef.close(true);
    }
  }
}
