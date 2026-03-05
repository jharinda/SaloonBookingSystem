import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

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
    Button,
    InputText,
  ],
  template: `
    <div class="dlg-wrap">
      <div class="dlg-head">
        <i
          class="pi dlg-icon"
          [class.pi-exclamation-triangle]="data.danger"
          [class.danger]="data.danger"
          [class.pi-question-circle]="!data.danger"
        ></i>
        <p class="dlg-msg">{{ data.message }}</p>
      </div>

      @if (data.requireText) {
        <p class="require-label">
          Type <strong>{{ data.requireText }}</strong> to confirm:
        </p>
        <input
          pInputText
          [(ngModel)]="typed"
          [placeholder]="data.requireText"
          autocomplete="off"
          class="full"
        />
      }

      <div class="dlg-actions">
        <p-button label="Cancel" [text]="true" (onClick)="close(false)" />
        <p-button
          [label]="data.confirmLabel ?? 'Confirm'"
          [severity]="data.danger ? 'danger' : 'primary'"
          [disabled]="data.requireText ? typed() !== data.requireText : false"
          (onClick)="close(true)"
        />
      </div>
    </div>
  `,
  styles: [`
    .dlg-wrap { min-width: 280px; }
    .dlg-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .dlg-icon { font-size: 22px; color: #6750a4; flex-shrink: 0; margin-top: 2px; }
    .dlg-icon.danger { color: #dc2626; }
    .dlg-msg { color: #4b5563; font-size: .9rem; line-height: 1.6; white-space: pre-line; margin: 0; }
    .require-label { font-size: .875rem; margin-bottom: 4px; }
    .full { width: 100%; margin-bottom: 12px; }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }

    :host-context(.app-dark) {
      .dlg-msg { color: #a1a1aa; }
      .require-label { color: #d4d4d8; }
    }
  `],
})
export class ConfirmDialogComponent {
  private readonly ref    = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);

  readonly data  = this.config.data as ConfirmDialogData;
  readonly typed = signal('');

  close(result: boolean): void {
    this.ref.close(result);
  }
}
