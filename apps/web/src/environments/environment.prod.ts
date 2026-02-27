export const environment = {
  production: true,
  /**
   * In production, the Angular app is served from the same origin as the gateway
   * (or configure via CORS).  Override with the actual deployed gateway URL.
   */
  apiUrl: '',   // same-origin — relative paths resolve to the gateway
};
