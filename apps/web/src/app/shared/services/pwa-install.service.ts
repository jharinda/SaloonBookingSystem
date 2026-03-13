import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PwaInstallService {
  /** The deferred `beforeinstallprompt` event, if available. */
  private deferredPrompt: BeforeInstallPromptEvent | null = null;

  /** Whether the browser has fired a `beforeinstallprompt` event. */
  readonly canInstall = signal(false);

  /** Whether this is iOS (which requires manual installation). */
  readonly isIOS = signal(false);

  /** Whether this is standalone mode (already installed). */
  readonly isStandalone = signal(false);

  /**
   * Attach a `beforeinstallprompt` listener to the given window.
   * Call this once from the root component (browser-only).
   */
  listen(win: Window): void {
    console.log('[PWA] Installing beforeinstallprompt listener');
    console.log('[PWA] User Agent:', win.navigator.userAgent);

    // Detect iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(win.navigator.userAgent) && !(win as any).MSStream;
    this.isIOS.set(isIOSDevice);

    // Check if already installed (standalone mode)
    const standalone = (win.navigator as any).standalone || win.matchMedia('(display-mode: standalone)').matches;
    this.isStandalone.set(standalone);

    if (isIOSDevice) {
      console.log('[PWA] iOS detected - beforeinstallprompt not supported');
      console.log('[PWA] User must manually add via Safari Share menu');
      // On iOS, show install instructions if not already in standalone mode
      if (!standalone) {
        this.canInstall.set(true);
      }
      return;
    }

    // Check service worker support and registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) {
          console.log('[PWA] ✅ Service Worker is registered:', reg);
          console.log('[PWA] SW State:', reg.active?.state);
        } else {
          console.warn('[PWA] ❌ No Service Worker registered yet');
        }
      });

      navigator.serviceWorker.ready.then(reg => {
        console.log('[PWA] ✅ Service Worker is ready:', reg);
      });
    } else {
      console.error('[PWA] ❌ Service Workers not supported');
    }

    win.addEventListener('beforeinstallprompt', (e) => {
      console.log('[PWA] ✅ beforeinstallprompt event fired!', e);
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.canInstall.set(true);
    });

    win.addEventListener('appinstalled', () => {
      console.log('[PWA] App installed!');
      this.deferredPrompt = null;
      this.canInstall.set(false);
    });

    if (standalone) {
      console.log('[PWA] App is already installed');
    } else {
      console.log('[PWA] App is NOT installed, waiting for install prompt...');
      console.log('[PWA] Chrome may require user interaction before showing prompt');
    }

    // Expose to window for manual testing
    (win as any).__pwaService__ = this;
    console.log('[PWA] Service exposed as window.__pwaService__ for manual testing');
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
