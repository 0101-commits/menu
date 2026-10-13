import { useCallback, useEffect, useRef } from 'react';
import type { Place } from '../types';
import type { AppState, SortKey } from '../lib/url-state';
import { readUrl, writeUrl } from '../lib/url-state';
import type { Near } from './useSearchState';
import type { RegionFilter } from '../lib/place-query';
import type { Snap } from '../components/ListPanel';

interface Options {
  initial: AppState;
  places: Place[];
  desktop: boolean;
  setSnap: React.Dispatch<React.SetStateAction<Snap>>;
  detailPlace: Place | null;
  setDetailPlace: React.Dispatch<React.SetStateAction<Place | null>>;
  setSelectedPlace: React.Dispatch<React.SetStateAction<Place | null>>;
  near: Near | null;
  radius: number;
  categories: string[];
  textFilter: string;
  sort: SortKey;
  openOnly: boolean;
  minScore: number | null;
  scope: 'map' | 'all';
  discover: boolean;
  mapCenter: { lat: number; lng: number } | null;
  mapLevel: number | null;
  follow: boolean;
  region: RegionFilter;
}

export function useUrlSync({
  initial, places, desktop, setSnap, detailPlace, setDetailPlace, setSelectedPlace,
  near, radius, categories, textFilter, sort, openOnly, minScore, scope, discover,
  mapCenter, mapLevel, follow, region,
}: Options) {
  const lastPlaceRef = useRef<string | undefined>(initial.place);
  const pushedRef = useRef(false);

  useEffect(() => {
    const place = detailPlace?.placeId;
    const opened = Boolean(place) && place !== lastPlaceRef.current;
    lastPlaceRef.current = place;
    if (opened) pushedRef.current = true;
    if (!place) pushedRef.current = false;
    writeUrl({
      near: near?.label,
      ll: near ? { lat: near.lat, lng: near.lng } : undefined,
      r: near ? radius : undefined,
      cat: categories,
      q: textFilter || undefined,
      sort,
      open: openOnly,
      min: minScore ?? undefined,
      place,
      all: scope === 'all' || undefined,
      discover: discover || undefined,
      c: mapCenter ?? undefined,
      z: mapLevel ?? undefined,
      follow: follow ? undefined : false,
    }, opened ? 'push' : 'replace');
    // region은 아직 URL 스키마에 없지만 변경 시 현재 URL을 다시 정규화한다.
    void region;
  }, [near, radius, categories, textFilter, sort, openOnly, minScore, detailPlace,
    scope, discover, mapCenter, mapLevel, follow, region]);

  useEffect(() => {
    const onPopState = () => {
      const state = readUrl();
      const hit = state.place ? places.find((place) => place.placeId === state.place) ?? null : null;
      lastPlaceRef.current = hit?.placeId;
      setDetailPlace(hit);
      if (hit) {
        setSelectedPlace(hit);
        if (!desktop) setSnap('full');
      } else if (!desktop) {
        setSnap((current) => current === 'full' ? 'half' : current);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [places, desktop, setSnap, setDetailPlace, setSelectedPlace]);

  return useCallback(() => {
    if (pushedRef.current) { window.history.back(); return; }
    setDetailPlace(null);
    if (!desktop) setSnap((current) => current === 'full' ? 'half' : current);
  }, [desktop, setDetailPlace, setSnap]);
}
