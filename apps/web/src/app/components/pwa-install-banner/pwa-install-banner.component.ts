import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { PwaInstallService } from '../../shared/services/pwa-install.service';

@Component({
  selector: 'app-pwa-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  template: `
    @if (pwaInstall.canInstall()) {
      <div class="pwa-banner" role="banner">
        <mat-icon class="pwa-banner__icon">install_mobile</mat-icon>
        <span class="pwa-banner__text">Install SnapSalon for a faster experience!</span>
        <div class="pwa-banner__actions">
          <button mat-flat-button color="primary" (click)="install()">Install</button>
          <button mat-icon-button aria-label="Dismiss" (click)="dismiss()">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .pwa-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--mat-sys-primary-container, #e8def8);
      color: var(--mat-sys-on-primary-container, #21005d);
      font-size: 14px;
    }
    .pwa-banner__icon { flex-shrink: 0; }
    .pwa-banner__text { flex: 1; }
    .pwa-banner__actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  `],
})
export class PwaInstallBannerComponent {
  readonly pwaInstall = inject(PwaInstallService);

  install(): void { this.pwaInstall.install(); }
  dismiss(): void { this.pwaInstall.dismiss(); }
}
