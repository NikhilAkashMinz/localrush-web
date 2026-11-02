// Where the LocalRush server is. The app talks to the same server as the website: the Next.js
// app running on your laptop ("npm run dev", port 3000).
//
// When the app is opened from "npx expo start" on that same laptop, Expo tells the app the
// laptop's Wi-Fi address, so the server address can be worked out with nothing to type.
// It can always be changed in the app (Account → Server), for example after switching Wi-Fi.

import Constants from 'expo-constants';

/** The port "npm run dev" serves the LocalRush website and API on. */
export const SERVER_PORT = 3000;
/** Expo's own port (the "Metro: exp://...:8081" address that "npx expo start" shows). It is never the LocalRush server. */
const EXPO_PORT = '8081';

/** The laptop's address as Expo sees it, as a server address, or null if it cannot be told. */
export function detectedServer(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? '';
  const host = hostUri.split(':')[0]?.trim();
  // In tunnel mode the address is Expo's, not the laptop's, so it cannot be used.
  if (!host || host.endsWith('.exp.direct') || host.endsWith('.exp.host') || host.includes('ngrok')) return null;
  return `http://${host}:${SERVER_PORT}`;
}

/**
 * Tidy what someone typed into a server address: "192.168.1.5" becomes
 * "http://192.168.1.5:3000". Expo's address from the terminal ("exp://192.168.1.5:8081") is
 * the same laptop, so it becomes the LocalRush server on it. Returns null if it cannot be an address.
 */
export function cleanServer(input: string): string | null {
  let text = input.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!text) return null;
  text = text.replace(/^exps?:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(text)) text = 'http://' + text;
  const match = /^(https?):\/\/([^/:\s]+)(?::(\d{1,5}))?$/i.exec(text);
  if (!match) return null;
  const [, scheme, host, port] = match;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const usePort = port && port !== EXPO_PORT ? port : isIp || host === 'localhost' || port === EXPO_PORT ? String(SERVER_PORT) : '';
  return `${scheme.toLowerCase()}://${host}${usePort ? ':' + usePort : ''}`;
}
