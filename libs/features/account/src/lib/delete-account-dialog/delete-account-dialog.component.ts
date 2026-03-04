import { ChangeDetectionStrategy, Component } from '@angular/core';
import { DialogModule } from 'primeng/dialog';

/**
 * @deprecated Delete-account confirmation is now handled inline in AccountComponent
 * via p-dialog + ConfirmationService. This stub is kept for backwards-compatible exports.
 */
@Component({
  selector: 'lib-delete-account-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogModule],
  template: `<!-- handled by AccountComponent -->`,
})
export class DeleteAccountDialogComponent {}
