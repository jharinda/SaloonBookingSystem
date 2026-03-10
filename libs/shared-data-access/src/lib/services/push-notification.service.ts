import { Injectable, inject, Inject, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { getMessaging, getToken, onMessage, Messaging, MessagePayload } from 'firebase/messaging';
import { initializeApp, FirebaseApp, FirebaseOptions } from 'firebase/app';

export interface FCMConfig {
  firebaseConfig: FirebaseOptions;
  fcmVapidKey: string;
}

export const FCM_CONFIG = 'FCM_CONFIG';

@Injectable({ providedIn: 'root' })
export class PushNotificationService {
  private readonly http = inject(HttpClient);
  private messaging: Messaging | null = null;
  private fcmToken: string | null = null;
  private firebaseApp: FirebaseApp | null = null;

  constructor(
    @Optional() @Inject(FCM_CONFIG) private readonly fcmConfig: FCMConfig | null
  ) {}

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

  /**
   * Initialize Firebase and FCM messaging.
   * Call this after user login.
   */
  async initializeFCM(): Promise<void> {
    if (!this.isSupported) {
      console.warn('Push notifications not supported in this browser');
      return;
    }

    // Check if Firebase config exists
    if (!this.fcmConfig?.firebaseConfig) {
      console.warn('Firebase config not found');
      return;
    }

    try {
      // Initialize Firebase app if not already done
      if (!this.firebaseApp) {
        this.firebaseApp = initializeApp(this.fcmConfig.firebaseConfig);
      }

      // Get FCM messaging instance
      this.messaging = getMessaging(this.firebaseApp);

      // Request permission
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.warn('Notification permission not granted');
        return;
      }

      // Get FCM token
      const vapidKey = this.fcmConfig.fcmVapidKey;
      if (!vapidKey) {
        console.warn('FCM VAPID key not configured');
        return;
      }

      this.fcmToken = await getToken(this.messaging, { vapidKey });

      if (this.fcmToken) {
        // Send token to backend
        await this.registerTokenWithBackend(this.fcmToken);

        // Listen for foreground messages
        this.setupForegroundMessageListener();
      }
    } catch (error) {
      console.error('Failed to initialize FCM:', error);
    }
  }

  /**
   * Register FCM token with the backend.
   */
  private async registerTokenWithBackend(token: string): Promise<void> {
    try {
      await this.http.post('/api/auth/fcm-token', { token }).toPromise();
      console.log('FCM token registered with backend');
    } catch (error) {
      console.error('Failed to register FCM token:', error);
    }
  }

  /**
   * Setup listener for foreground messages.
   * When the app is in the foreground, messages are handled here.
   */
  private setupForegroundMessageListener(): void {
    if (!this.messaging) return;

    onMessage(this.messaging, (payload: MessagePayload) => {
      console.log('Foreground message received:', payload);

      const notificationTitle = payload.notification?.title || 'New Notification';
      const notificationBody = payload.notification?.body || '';

      // Show browser notification
      if (this.permission === 'granted') {
        new Notification(notificationTitle, {
          body: notificationBody,
          icon: '/assets/icons/icon-192x192.png',
          badge: '/assets/icons/icon-72x72.png',
          data: payload.data,
        });
      }

      // Dispatch custom event for UI components to listen to
      window.dispatchEvent(
        new CustomEvent('fcm-message', {
          detail: payload,
        })
      );
    });
  }

  /**
   * Unregister FCM token from the backend.
   * Call this on logout.
   */
  async unregisterToken(): Promise<void> {
    if (!this.fcmToken) return;

    try {
      await this.http
        .delete('/api/auth/fcm-token', {
          body: { token: this.fcmToken },
        })
        .toPromise();
      console.log('FCM token unregistered');
      this.fcmToken = null;
    } catch (error) {
      console.error('Failed to unregister FCM token:', error);
    }
  }

  /**
   * Get the current FCM token (if available).
   */
  getToken(): string | null {
    return this.fcmToken;
  }
}

