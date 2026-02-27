import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  /** The deferred `beforeinstallprompt` event, if available. */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Whether the browser has fired a `beforeinstallprompt` event. */
  readonly canInstall = signal(false);

  /**
   * Attach a `beforeinstallprompt` listener to the given window.
   * Call this once from the root component (browser-only).
   */
  listen(win: Window): void {
    win.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    win.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.canInstall.set(false);
    });
  }

  /** Show the browser-native install prompt. */
  async install(): Promise<void> {
    if (!this.deferredPrompt) return;
    await this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      this.deferredPrompt = null;
      this.canInstall.set(false);
    }
  }

  dismiss(): void {
    this.canInstall.set(false);
  }
}

/** Minimal type shim for the non-standard BeforeInstallPromptEvent. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  prompt(): Promise<void>;
}
