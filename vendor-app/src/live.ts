// The live connection to the LocalRush server: the same stream the website listens to
// (/api/live, server-sent events). The server sends a short message the moment something this
// account cares about changes, and the app re-reads its data straight away, so a change made on
// the website or in another app shows up here at once.
//
// React Native's fetch cannot read a reply while it is still arriving, but XMLHttpRequest can,
// so the stream is read with that. If the connection drops, it opens again by itself.

export type LiveKind = 'catalog' | 'orders';

export type LiveEvents = {
  /** Sent on every (re)connect: read everything again, in case something changed meanwhile. */
  onHello(): void;
  onChange(kinds: LiveKind[]): void;
  onStatus(connected: boolean): void;
};

/** After this much text, start a fresh connection, so the reply kept in memory stays small. */
const MAX_TEXT = 200_000;
/** The server closes each stream after a while; open the next one this soon. */
const AGAIN_MS = 500;

/** Open the stream and keep it open. Returns a function that closes it for good. */
export function openLive(url: string, headers: Record<string, string>, events: LiveEvents): () => void {
  let current: XMLHttpRequest | null = null;
  let stopped = false;
  let connected = false;
  let failures = 0;
  let retryMs = 3000;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const setConnected = (on: boolean) => {
    if (connected === on) return;
    connected = on;
    events.onStatus(on);
  };

  const later = (ms: number) => {
    if (stopped || timer) return;
    timer = setTimeout(() => {
      timer = null;
      connect();
    }, ms);
  };

  function handle(block: string) {
    let data = '';
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue; // ": still here" keeps the connection open
      const colon = line.indexOf(':');
      const field = colon < 0 ? line : line.slice(0, colon);
      const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
      if (field === 'data') data += (data ? '\n' : '') + value;
      else if (field === 'retry' && /^\d+$/.test(value)) retryMs = Number(value);
    }
    if (!data) return;
    failures = 0;
    setConnected(true);
    try {
      const message = JSON.parse(data) as { hello?: boolean; changed?: LiveKind[] };
      if (message.hello) events.onHello();
      else if (message.changed && message.changed.length > 0) events.onChange(message.changed);
    } catch {
      events.onHello();
    }
  }

  function connect() {
    if (stopped) return;
    const request = new XMLHttpRequest();
    current = request;
    let seen = 0;
    let buffer = '';
    let heard = false;

    const read = () => {
      if (current !== request) return;
      let text = '';
      try {
        text = request.responseText ?? '';
      } catch {
        return;
      }
      if (text.length <= seen) return;
      buffer += text.slice(seen);
      seen = text.length;
      heard = true;
      // Each message ends with a blank line.
      let end = buffer.search(/\r?\n\r?\n/);
      while (end >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end).replace(/^\r?\n\r?\n/, '');
        handle(block);
        end = buffer.search(/\r?\n\r?\n/);
      }
      if (seen > MAX_TEXT) {
        current = null;
        request.abort();
        connect();
      }
    };

    request.onreadystatechange = () => {
      if (request.readyState === 3 || request.readyState === 4) read();
      if (request.readyState !== 4 || current !== request) return;
      current = null;
      setConnected(false);
      if (request.status === 200 && heard) {
        // The server ended the stream as it does every few minutes: carry straight on.
        later(AGAIN_MS);
      } else {
        // No server, or it said no: try again, waiting longer each time, up to 30 seconds.
        failures++;
        later(Math.min(30_000, retryMs * failures));
      }
    };
    request.onprogress = read;
    request.open('GET', url);
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value);
    request.setRequestHeader('Accept', 'text/event-stream');
    request.setRequestHeader('Cache-Control', 'no-cache');
    request.send();
  }

  connect();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    timer = null;
    const request = current;
    current = null;
    request?.abort();
    setConnected(false);
  };
}
