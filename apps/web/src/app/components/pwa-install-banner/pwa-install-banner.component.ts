import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Button } from 'primeng/button';
import { PwaInstallService } from '../../shared/services/pwa-install.service';

@Component({
  selector: 'app-pwa-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Button],
  template: `
    @if (pwaInstall.canInstall() && !pwaInstall.isStandalone()) {
      <div class="pwa-banner" role="banner">
        <i class="pi pi-download pwa-banner__icon"></i>

        @if (pwaInstall.isIOS()) {
          <!-- iOS: Show manual instructions -->
          <div class="pwa-banner__text">
            <strong>Install SnapSalon:</strong>
            Tap <i class="pi pi-share-alt" style="font-size: 0.9em;"></i> then "Add to Home Screen"
          </div>
          <div class="pwa-banner__actions">
            <p-button icon="pi pi-times" [rounded]="true" [text]="true" severity="secondary" aria-label="Dismiss" (onClick)="dismiss()" />
          </div>
        } @else {
          <!-- Android/Chrome: Show install button -->
          <span class="pwa-banner__text">Install SnapSalon for a faster experience!</span>
          <div class="pwa-banner__actions">
            <p-button label="Install" (onClick)="install()" />
            <p-button icon="pi pi-times" [rounded]="true" [text]="true" severity="secondary" aria-label="Dismiss" (onClick)="dismiss()" />
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .pwa-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      background: var(--p-primary-50, #f5f3ff);
      color: var(--p-primary-900, #4c1d95);
      font-size: 14px;
    }
    .pwa-banner__icon { flex-shrink: 0; font-size: 1.25rem; }
    .pwa-banner__text { flex: 1; line-height: 1.4; }
    .pwa-banner__actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }

    :host-context(.app-dark) {
      .pwa-banner {
        background: #27272a;
        color: #f4f4f5;
      }
    }
  `],
})
export class PwaInstallBannerComponent {
  readonly pwaInstall = inject(PwaInstallService);

  install(): void { this.pwaInstall.install(); }
  dismiss(): void { this.pwaInstall.dismiss(); }
}
