import { TestBed } from '@angular/core/testing';
import { RouterOutlet, provideRouter } from '@angular/router';
import { vi } from 'vitest';

import { App } from './app';
import { NotificationInboxService } from './core/services/notification-inbox.service';
import { PwaInstallService } from './shared/services/pwa-install.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: NotificationInboxService, useValue: {} },
        { provide: PwaInstallService, useValue: { listen: vi.fn() } },
      ],
    })
      // Swap out heavy child components (NavbarComponent, PwaInstallBannerComponent,
      // ToastModule) so this stays a unit test of the App class itself.
      .overrideComponent(App, { set: { imports: [RouterOutlet] } })
      .compileComponents();
  });

  it('should create the app', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});
