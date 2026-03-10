export const environment = {
  production: true,
  /**
   * In production, the Angular app is served from the same origin as the gateway
   * (or configure via CORS).  Override with the actual deployed gateway URL.
   */
  apiUrl: '',   // same-origin — relative paths resolve to the gateway

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
