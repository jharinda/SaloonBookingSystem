import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  /** True when the browser supports the Notifications API. */
  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'Notification' in window;
  }

  /** Current permission state: 'default' | 'granted' | 'denied' */
  get permission(): NotificationPermission {
    if (!this.isSupported) return 'denied';
    return Notification.permission;
  }

  /**
   * Request notification permission from the user.
   * Returns the resulting permission state.
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported) return 'denied';
    return Notification.requestPermission();
  }
}
