import {
  ChangeDetectionStrategy,
  Component,
  inject,
  PLATFORM_ID,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ToastModule } from 'primeng/toast';
import { NavbarComponent } from './components/navbar/navbar.component';
import { PwaInstallBannerComponent } from './components/pwa-install-banner/pwa-install-banner.component';
import { PwaInstallService } from './shared/services/pwa-install.service';
import { NotificationInboxService } from './core/services/notification-inbox.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, NavbarComponent, PwaInstallBannerComponent, ToastModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly pwaInstall = inject(PwaInstallService);
  // Eagerly instantiate so the SSE inbox starts collecting
  // notifications as soon as the app loads.
  private readonly _notifInbox = inject(NotificationInboxService);

  constructor() {
    // Register the beforeinstallprompt listener only in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.pwaInstall.listen(window);
    }
  }
}
