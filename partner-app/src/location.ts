// The phone's GPS, through expo-location. Used only while the partner is online and the app is
// open: to find deliveries near them, and to show the customer where they are while delivering.

import * as Location from 'expo-location';

export type Fix = { lat: number; lng: number; accuracy: number | null; at: number };

/** granted: we can read GPS. denied: the partner said no. disabled: location is switched off on the phone. */
export type Permission = 'granted' | 'denied' | 'disabled';

export async function ensurePermission(): Promise<Permission> {
  const on = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!on) return 'disabled';
  const now = await Location.getForegroundPermissionsAsync();
  if (now.granted) return 'granted';
  if (!now.canAskAgain) return 'denied';
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

const toFix = (l: Location.LocationObject): Fix => ({
  lat: l.coords.latitude,
  lng: l.coords.longitude,
  accuracy: l.coords.accuracy,
  at: l.timestamp,
});

/**
 * Follow the phone's position. Returns a function that stops following it. While delivering
 * (`precise`), ask for an exact fix every few seconds, so the customer's live map moves smoothly;
 * otherwise a rougher one now and then is enough to find jobs nearby, and saves battery.
 */
export async function follow(onFix: (f: Fix) => void, onError: (message: string) => void, precise = false): Promise<() => void> {
  // Start with the last known position, so the partner does not wait for a fresh fix.
  Location.getLastKnownPositionAsync({ maxAge: 5 * 60_000 })
    .then((l) => l && onFix(toFix(l)))
    .catch(() => undefined);
  const subscription = await Location.watchPositionAsync(
    precise
      ? { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 }
      : { accuracy: Location.Accuracy.Balanced, timeInterval: 10_000, distanceInterval: 25 },
    (l) => onFix(toFix(l)),
    (reason) => onError(reason),
  );
  return () => subscription.remove();
}
