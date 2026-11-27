// Where the LocalRush server is. The app talks to the same server as the website: either the
// live website on the internet (https://...), or the Next.js app running on your laptop
// ("npm run dev", port 3000) while testing.
//
// An app built for the live service has the website's address built in (EXPO_PUBLIC_SERVER_URL,
// see README). Otherwise, when the app is opened from "npx expo start", Expo tells the app the
// laptop's Wi-Fi address, so the server address can be worked out with nothing to type.
// It can always be changed in the app (the Server button), for example after switching Wi-Fi.

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

/** The live website's address, built into the app when it was made (EXPO_PUBLIC_SERVER_URL), or null. */
export function builtInServer(): string | null {
  return cleanServer(process.env.EXPO_PUBLIC_SERVER_URL ?? '');
}

/** The address to use when none was typed in: the built-in website, or else the laptop Expo runs on. */
export const defaultServer = () => builtInServer() ?? detectedServer();

/** A laptop on the same Wi-Fi (http), rather than the website on the internet (https). */
export const onLaptop = (server: string) => server.startsWith('http://');

/** A name on this network (a Wi-Fi address, "localhost", "my-laptop", "printer.local"), not a website on the internet. */
const isLocalHost = (host: string) =>
  /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === 'localhost' || !host.includes('.') || host.endsWith('.local');

/**
 * Tidy what someone typed into a server address: "192.168.1.5" becomes
 * "http://192.168.1.5:3000", and "localrush.onrender.com" becomes "https://localrush.onrender.com".
 * Expo's address from the terminal ("exp://192.168.1.5:8081") is the same laptop, so it becomes
 * the LocalRush server on it. Returns null if it cannot be an address.
 */
export function cleanServer(input: string): string | null {
  let text = input.trim().replace(/\/+$/, '').replace(/\/api$/, '');
  if (!text) return null;
  text = text.replace(/^exps?:\/\//i, 'http://');
  if (!/^https?:\/\//i.test(text)) {
    const host = text.split(/[/:]/)[0].toLowerCase();
    text = (isLocalHost(host) ? 'http://' : 'https://') + text;
  }
  const match = /^(https?):\/\/([^/:\s]+)(?::(\d{1,5}))?$/i.exec(text);
  if (!match) return null;
  const [, scheme, rawHost, port] = match;
  const host = rawHost.toLowerCase();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const usePort = port && port !== EXPO_PORT ? port : isIp || host === 'localhost' || port === EXPO_PORT ? String(SERVER_PORT) : '';
  return `${scheme.toLowerCase()}://${host}${usePort ? ':' + usePort : ''}`;
}
