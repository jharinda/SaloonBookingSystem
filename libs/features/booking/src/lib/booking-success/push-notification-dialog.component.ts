import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Button } from 'primeng/button';
import { DynamicDialogRef } from 'primeng/dynamicdialog';
import { PushNotificationService } from '@org/shared-data-access';

@Component({
  selector: 'lib-push-notification-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    <div class="pn-dialog">
      <i class="pi pi-bell pn-dialog__icon"></i>
      <p>Enable push notifications to get reminders for your upcoming appointments and booking updates.</p>
    </div>
    <div class="dlg-actions">
      <p-button label="Not now" [text]="true" (onClick)="dismiss()" />
      <p-button label="Enable notifications" [disabled]="loading()" [loading]="loading()" (onClick)="enable()" />
    </div>
  `,
  styles: [`
    .pn-dialog { text-align: center; padding: 0 0 16px; }
    .pn-dialog__icon { font-size: 48px; color: var(--p-primary-500, #7c3aed); display: block; margin: 0 0 12px; }
    .pn-dialog p { font-size: 14px; color: #49454f; }
    .dlg-actions { display: flex; justify-content: flex-end; gap: 8px; }

    :host-context(.app-dark) {
      .pn-dialog p { color: #a1a1aa; }
    }
  `],
})
export class PushNotificationDialogComponent {
  private readonly pushNotification = inject(PushNotificationService);
  private readonly ref = inject(DynamicDialogRef);

  readonly loading = signal(false);

  async enable(): Promise<void> {
    this.loading.set(true);
    await this.pushNotification.requestPermission();
    this.loading.set(false);
    this.ref.close();
  }

  dismiss(): void {
    this.ref.close();
  }
}
