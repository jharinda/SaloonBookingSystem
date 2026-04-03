export const environment = {
  production: false,
  /** Sentry browser DSN (optional; only used when building with production config). */
  sentryDsn: '',
  /**
   * All Angular HTTP calls are routed through the API Gateway.
   * In development the gateway runs on port 3000.
   */
  apiUrl: 'http://localhost:3000',

  /**
   * Firebase configuration for FCM push notifications.
   * Get these values from Firebase Console > Project Settings > General.
   */
  firebaseConfig: {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
  },

  /**
   * FCM VAPID key (Web Push certificate).
   * Get from Firebase Console > Project Settings > Cloud Messaging > Web Push certificates.
   */
  fcmVapidKey: "YOUR_VAPID_KEY_HERE",
};
