import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

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
    Button,
    Textarea,
  ],
  template: `
    <div class="dlg-body">
      <p class="confirm-msg">
        Are you sure you want to cancel your
        <strong>{{ data.serviceName }}</strong> appointment at
        <strong>{{ data.salonName }}</strong>?
        <br />
        <span class="warn-text">Cancellations cannot be undone.</span>
      </p>

      <textarea
        pTextarea
        [(ngModel)]="reason"
        rows="3"
        placeholder="Let the salon know why you're cancelling..."
        maxlength="300"
        aria-label="Cancellation reason"
        class="reason-textarea"
      ></textarea>
    </div>

    <div class="dlg-actions">
      <p-button label="Keep Appointment" [text]="true" (onClick)="dismiss()" />
      <p-button label="Yes, Cancel It" severity="danger" (onClick)="confirm()" />
    </div>
  `,
  styles: [`
    .dlg-body { padding: 0; }
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
    .reason-textarea { width: 100%; resize: vertical; }
    .dlg-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }

    :host-context(.app-dark) {
      .confirm-msg { color: #d4d4d8; }
      .warn-text { color: #f87171; }
    }
  `],
})
export class CancelBookingDialogComponent {
  private readonly ref    = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);

  readonly data = this.config.data as CancelDialogData;
  reason = '';

  confirm(): void {
    this.ref.close({ confirmed: true, reason: this.reason } satisfies CancelDialogResult);
  }

  dismiss(): void {
    this.ref.close({ confirmed: false, reason: '' } satisfies CancelDialogResult);
  }
}
