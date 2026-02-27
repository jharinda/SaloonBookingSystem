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

export interface ConfirmDialogData {
  title:       string;
  message:     string;
  confirmLabel?: string;
  /** If set, render a text input and require the entered text to match */
  requireText?: string;
  danger?:      boolean;
}

@Component({
  selector: 'lib-confirm-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  template: `
    <div class="dlg-wrap">
      <div class="dlg-head">
        <mat-icon class="dlg-icon" [class.danger]="data.danger">
          {{ data.danger ? 'warning' : 'help_outline' }}
        </mat-icon>
        <h2 mat-dialog-title>{{ data.title }}</h2>
      </div>

      <mat-dialog-content>
        <p class="dlg-msg">{{ data.message }}</p>

        @if (data.requireText) {
          <p class="require-label">
            Type <strong>{{ data.requireText }}</strong> to confirm:
          </p>
          <mat-form-field appearance="outline" class="full">
            <input matInput [(ngModel)]="typed" [placeholder]="data.requireText" autocomplete="off" />
          </mat-form-field>
        }
      </mat-dialog-content>

      <mat-dialog-actions align="end">
        <button mat-button [mat-dialog-close]="false">Cancel</button>
        <button
          mat-flat-button
          [class.danger-btn]="data.danger"
          [class.primary-btn]="!data.danger"
          [disabled]="data.requireText ? typed() !== data.requireText : false"
          [mat-dialog-close]="true"
        >{{ data.confirmLabel ?? 'Confirm' }}</button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .dlg-wrap { padding: 8px; min-width: 340px; max-width: 440px; }
    .dlg-head { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
    .dlg-icon { font-size: 26px; width: 26px; height: 26px; color: #6750a4; }
    .dlg-icon.danger { color: #dc2626; }
    h2[mat-dialog-title] { margin: 0; font-size: 1.15rem; font-weight: 700; }
    .dlg-msg { color: #4b5563; font-size: .9rem; line-height: 1.6; white-space: pre-line; }
    .require-label { font-size: .875rem; margin-bottom: 4px; }
    .full { width: 100%; }
    .danger-btn { background: #dc2626 !important; color: #fff !important; border-radius: 6px; }
    .primary-btn { background: #6750a4 !important; color: #fff !important; border-radius: 6px; }
    button[disabled] { opacity: .45 !important; }
  `],
})
export class ConfirmDialogComponent {
  readonly data    = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  readonly typed   = signal('');
  private readonly _ref = inject(MatDialogRef<ConfirmDialogComponent>);
}
