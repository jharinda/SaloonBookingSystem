import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Button } from 'primeng/button';
import { Textarea } from 'primeng/textarea';
import { DynamicDialogRef, DynamicDialogConfig } from 'primeng/dynamicdialog';

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
    Button,
    Textarea,
  ],
  template: `
    <div class="dlg-body">
      <div class="dlg-head">
        <i class="pi pi-ban warn-icon"></i>
        <p class="dlg-msg">
          You are rejecting <strong>{{ data.salonName }}</strong>.
          Please provide a reason that will be sent to the salon owner.
        </p>
      </div>
      <textarea
        pTextarea
        rows="3"
        [(ngModel)]="reason"
        placeholder="e.g. Incomplete information, misleading details…"
        class="full"
      ></textarea>
    </div>
    <div class="dlg-actions">
      <p-button label="Cancel" [text]="true" (onClick)="cancel()" />
      <p-button label="Reject Salon" severity="danger" [disabled]="!reason().trim()" (onClick)="confirm()" />
    </div>
  `,
  styles: [`
    .dlg-body { padding: 0; }
    .dlg-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 12px; }
    .warn-icon { color: #dc2626; font-size: 22px; flex-shrink: 0; margin-top: 2px; }
    .dlg-msg { color: #4b5563; font-size: .9rem; line-height: 1.6; margin: 0; }
    .full { width: 100%; resize: vertical; }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  `],
})
export class RejectSalonDialogComponent {
  private readonly ref    = inject(DynamicDialogRef);
  private readonly config = inject(DynamicDialogConfig);

  readonly data   = this.config.data as RejectSalonDialogData;
  readonly reason = signal('');

  cancel():  void { this.ref.close({ confirmed: false, reason: '' }           satisfies RejectSalonDialogResult); }
  confirm(): void { this.ref.close({ confirmed: true,  reason: this.reason() } satisfies RejectSalonDialogResult); }
}
