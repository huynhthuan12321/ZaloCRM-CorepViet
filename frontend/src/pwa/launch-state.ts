/** RAM only: capture a Home Screen deep link before the router can redirect to login. */
export const pwaLaunchUrl = typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search + window.location.hash;
