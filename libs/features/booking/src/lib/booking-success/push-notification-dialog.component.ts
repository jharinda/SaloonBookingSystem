import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { PushNotificationService } from '@org/shared-data-access';

@Component({
  selector: 'lib-push-notification-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatDialogModule, MatIconModule],
  template: `
    <div class="pn-dialog">
      <mat-icon class="pn-dialog__icon" color="primary">notifications_active</mat-icon>
      <h2 mat-dialog-title>Stay in the loop</h2>
      <mat-dialog-content>
        <p>Enable push notifications to get reminders for your upcoming appointments and booking updates.</p>
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button (click)="dismiss()">Not now</button>
        <button mat-flat-button color="primary" [disabled]="loading()" (click)="enable()">
          Enable notifications
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .pn-dialog { text-align: center; padding: 8px 0; }
    .pn-dialog__icon { font-size: 48px; width: 48px; height: 48px; margin-bottom: 8px; }
    mat-dialog-content p { font-size: 14px; color: var(--mat-sys-on-surface-variant, #49454f); }
  `],
})
export class PushNotificationDialogComponent {
  private readonly pushNotification = inject(PushNotificationService);
  private readonly dialogRef = inject(MatDialogRef<PushNotificationDialogComponent>);

  readonly loading = signal(false);

  async enable(): Promise<void> {
    this.loading.set(true);
    await this.pushNotification.requestPermission();
    this.loading.set(false);
    this.dialogRef.close();
  }

  dismiss(): void {
    this.dialogRef.close();
  }
}
