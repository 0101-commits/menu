import { useCallback, useEffect, useState } from 'react';
import type { Discovered, RatingsMap } from '../types';
import type { Near } from './useSearchState';
import { discoverNearby } from '../lib/kakao';
import { RATINGS_API, fetchRatings } from '../lib/worker';

export function useDiscovery(options: {
  initial: boolean;
  near: Near | null;
  mapCenter: { lat: number; lng: number } | null;
  radius: number;
}) {
  const [discover, setDiscover] = useState(options.initial);
  const [discovered, setDiscovered] = useState<Discovered[]>([]);
  const [discoveredRatings, setDiscoveredRatings] = useState<RatingsMap>({});
  const [discoverFailed, setDiscoverFailed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!discover) { setDiscovered([]); return; }
    const center = options.near ?? options.mapCenter;
    if (!center) return;
    let alive = true;
    void discoverNearby(center.lat, center.lng, options.near ? options.radius : 800).then((items) => {
      if (alive) setDiscovered(items);
    });
    return () => { alive = false; };
  }, [discover, options.near, options.mapCenter, options.radius]);

  const onDiscoveredOpen = useCallback((item: Discovered) => {
    const key = `k:${item.kakaoId}`;
    if (discoveredRatings[key] || !RATINGS_API) return;
    setDiscoverFailed((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    void fetchRatings({ k: item.kakaoId })
      .then((ratings) => setDiscoveredRatings((prev) => ({ ...prev, [key]: ratings })))
      .catch(() => setDiscoverFailed((prev) => new Set(prev).add(key)));
  }, [discoveredRatings]);

  return {
    discover, setDiscover, discovered, discoveredRatings, discoverFailed,
    onDiscoveredOpen, discoverUnavailable: !RATINGS_API,
  };
}
