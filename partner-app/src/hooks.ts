import { useEffect, useState } from 'react';

/** The current time, updated every `ms`, for "packed 2 min ago" and similar. */
export function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}
