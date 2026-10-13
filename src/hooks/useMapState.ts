import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../types';
import { listSignature } from '../lib/data';
import type { AppState } from '../lib/url-state';
import type { Snap } from '../components/ListPanel';

interface Options {
  initial: AppState;
  places: Place[];
  desktop: boolean;
  snap: Snap;
  setSnap: React.Dispatch<React.SetStateAction<Snap>>;
}

export function useMapState({ initial, places, desktop, snap, setSnap }: Options) {
  // null은 지도가 아직 범위를 알려주지 않은 상태다. []와 합치면 목록 전탈락 회귀가 난다.
  const [visiblePlaces, setVisiblePlaces] = useState<Place[] | null>(null);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapLevel, setMapLevel] = useState<number | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [detailPlace, setDetailPlace] = useState<Place | null>(null);
  const [follow, setFollow] = useState(initial.follow !== false);
  const [pendingView, setPendingView] = useState<Place[] | null>(null);

  const restoredInitialPlace = useRef(false);
  useEffect(() => {
    if (restoredInitialPlace.current || !places.length) return;
    restoredInitialPlace.current = true;
    if (!initial.place) return;
    const hit = places.find((place) => place.placeId === initial.place);
    if (hit) { setSelectedPlace(hit); setDetailPlace(hit); }
  }, [initial.place, places]);

  const handleDetail = useCallback((place: Place) => {
    setSelectedPlace(place);
    setDetailPlace(place);
    if (!desktop) setSnap('full');
  }, [desktop, setSnap]);

  const handleSelect = useCallback((place: Place | null) => {
    setSelectedPlace(place);
    if (!place) return;
    if (desktop) { setDetailPlace(place); return; }
    if (snap === 'peek' || snap === 'full') setSnap('half');
  }, [desktop, snap, setSnap]);

  const handleViewChange = useCallback((visible: Place[], center: { lat: number; lng: number }, level: number) => {
    setMapCenter(center);
    setMapLevel(level);
    if (follow) { setVisiblePlaces(visible); setPendingView(null); return; }
    setPendingView(visible);
  }, [follow]);

  const applyPendingView = useCallback(() => {
    if (pendingView) setVisiblePlaces(pendingView);
    setPendingView(null);
  }, [pendingView]);

  useEffect(() => {
    if (follow && pendingView) { setVisiblePlaces(pendingView); setPendingView(null); }
  }, [follow, pendingView]);

  const pendingDiffers = useMemo(
    () => Boolean(pendingView) && listSignature(pendingView!) !== listSignature(visiblePlaces ?? []),
    [pendingView, visiblePlaces],
  );

  return {
    visiblePlaces, setVisiblePlaces, mapCenter, mapLevel, selectedPlace, setSelectedPlace,
    detailPlace, setDetailPlace, follow, setFollow, pendingView, pendingDiffers,
    handleDetail, handleSelect, handleViewChange, applyPendingView,
  };
}
