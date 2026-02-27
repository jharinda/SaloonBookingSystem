import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component';
import { PwaInstallBannerComponent } from './components/pwa-install-banner/pwa-install-banner.component';
import { PwaInstallService } from './shared/services/pwa-install.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NavbarComponent, PwaInstallBannerComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pwaInstall = inject(PwaInstallService);

  constructor() {
    // Register the beforeinstallprompt listener only in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.pwaInstall.listen(window);
    }
  }
}
