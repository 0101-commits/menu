import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../../types';
import { loadKakao, type KakaoNS } from '../../lib/kakao';
import { colorOf } from '../../lib/categories';
import { distanceM } from '../../lib/geo';
import { dominantColor, nearbyRadiusForLevel } from '../../lib/map-geometry';
import { buildMarkerImages, CLUSTER_STYLES, type MarkerImages } from './markerImages';
import type { KakaoObject, MapRuntime } from './types';

interface Options {
  places: Place[];
  initialView?: { c?: { lat: number; lng: number }; z?: number };
  onSelect: (place: Place | null) => void;
  onBoundsChange: (visible: Place[], center: { lat: number; lng: number }, level: number) => void;
  onClearDiscovery: () => void;
}

export function useBaseMap({ places, initialView, onSelect, onBoundsChange, onClearDiscovery }: Options) {
  const mapEl = useRef<HTMLDivElement>(null);
  const kakaoRef = useRef<KakaoNS | null>(null);
  const mapRef = useRef<KakaoObject | null>(null);
  const imagesRef = useRef<MarkerImages | null>(null);
  const markersRef = useRef<{ marker: KakaoObject; place: Place }[]>([]);
  const markerByPlaceId = useRef(new Map<string, KakaoObject>());
  const clustererRef = useRef<KakaoObject | null>(null);
  const circleRef = useRef<KakaoObject | null>(null);
  const suppressClick = useRef(false);
  const initialRef = useRef(initialView);
  const callbacks = useRef({ onSelect, onBoundsChange, places, onClearDiscovery });
  callbacks.current = { onSelect, onBoundsChange, places, onClearDiscovery };

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nearby, setNearby] = useState<Place[] | null>(null);

  const runtime = useMemo<MapRuntime>(() => ({
    mapEl, kakaoRef, mapRef, imagesRef, markersRef, markerByPlaceId,
    clustererRef, circleRef, suppressClick,
  }), []);

  useEffect(() => {
    let cancelled = false;
    void loadKakao()
      .then((kakao) => {
        if (cancelled || !mapEl.current || mapRef.current) return;
        kakaoRef.current = kakao;
        imagesRef.current = buildMarkerImages(kakao);
        const first = places[0];
        const view = initialRef.current;
        const map = new kakao.maps.Map(mapEl.current, {
          center: new kakao.maps.LatLng(
            view?.c?.lat ?? first?.lat ?? 37.5665,
            view?.c?.lng ?? first?.lng ?? 126.978,
          ),
          level: view?.z ?? 7,
        });
        mapRef.current = map;

        const items = places.map((place) => {
          const marker = new kakao.maps.Marker({
            position: new kakao.maps.LatLng(place.lat, place.lng),
            image: imagesRef.current!.normal.get(colorOf(place.category)),
            title: place.name,
          });
          kakao.maps.event.addListener(marker, 'click', () => {
            suppressClick.current = true;
            setNearby(null);
            callbacks.current.onClearDiscovery();
            callbacks.current.onSelect(place);
          });
          markerByPlaceId.current.set(place.placeId, marker);
          return { marker, place };
        });
        markersRef.current = items;

        clustererRef.current = new (kakao.maps as KakaoObject).MarkerClusterer({
          map,
          markers: items.map((item) => item.marker),
          gridSize: 60,
          minLevel: 5,
          disableClickZoom: false,
          styles: CLUSTER_STYLES,
          calculator: [10, 100],
        });

        const colorByMarker = new Map(items.map((item) => [item.marker, colorOf(item.place.category)]));
        kakao.maps.event.addListener(clustererRef.current, 'clustered', (clusters: KakaoObject[]) => {
          for (const cluster of clusters) {
            const element = cluster?.getClusterMarker?.()?.getContent?.();
            if (!element || typeof element !== 'object' || !element.style) continue;
            const color = dominantColor(cluster.getMarkers().map((marker: KakaoObject) => colorByMarker.get(marker)));
            if (!color) continue;
            element.style.boxSizing = 'border-box';
            element.style.border = `3px solid ${color}`;
          }
        });

        kakao.maps.event.addListener(map, 'click', (event: KakaoObject) => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          callbacks.current.onClearDiscovery();
          const lat = event.latLng.getLat();
          const lng = event.latLng.getLng();
          const radius = nearbyRadiusForLevel(map.getLevel());
          const hits = callbacks.current.places.filter((place) => distanceM(lat, lng, place.lat, place.lng) < radius);
          if (hits.length) { setNearby(hits.slice(0, 12)); return; }
          setNearby(null);
          callbacks.current.onSelect(null);
        });

        const reportBounds = () => {
          const bounds = map.getBounds();
          const center = map.getCenter();
          callbacks.current.onBoundsChange(
            callbacks.current.places.filter((place) => bounds.contain(new kakao.maps.LatLng(place.lat, place.lng))),
            { lat: center.getLat(), lng: center.getLng() },
            map.getLevel(),
          );
        };
        kakao.maps.event.addListener(map, 'idle', reportBounds);
        setTimeout(reportBounds, 300);
        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [places]);

  return { runtime, status, nearby, setNearby };
}
