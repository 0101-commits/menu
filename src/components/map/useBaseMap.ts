import { useEffect, useMemo, useRef, useState } from 'react';
import type { Place } from '../../types';
import { loadKakao, type KakaoNS } from '../../lib/kakao';
import { distanceM } from '../../lib/geo';
import { nearbyRadiusForLevel } from '../../lib/map-geometry';
import { buildMarkerImages, type MarkerImages } from './markerImages';
import { createDotLayer, type DotLayer } from './dotLayer';
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
  const dotLayerRef = useRef<DotLayer | null>(null);
  const placeById = useRef(new Map<string, Place>());
  const markerByPlaceId = useRef(new Map<string, KakaoObject>());
  const circleRef = useRef<KakaoObject | null>(null);
  const suppressClick = useRef(false);
  const initialRef = useRef(initialView);
  const callbacks = useRef({ onSelect, onBoundsChange, places, onClearDiscovery });
  callbacks.current = { onSelect, onBoundsChange, places, onClearDiscovery };

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [nearby, setNearby] = useState<Place[] | null>(null);

  const runtime = useMemo<MapRuntime>(() => {
    const select = (place: Place) => {
      setNearby(null);
      callbacks.current.onClearDiscovery();
      callbacks.current.onSelect(place);
    };
    return {
      mapEl, kakaoRef, mapRef, imagesRef, dotLayerRef, placeById, markerByPlaceId,
      circleRef, suppressClick,
      // 가게 대부분은 캔버스(dotLayer)에 그린다. 카카오 마커는 번호 핀·선택 핀처럼 따로 띄울 때만
      // 그 자리에서 만든다 — 4,084개를 미리 만들면 그것만으로 첫 화면이 무거워진다.
      markerFor: (place: Place) => {
        const kakao = kakaoRef.current;
        if (!kakao) return null;
        let marker = markerByPlaceId.current.get(place.placeId);
        if (!marker) {
          marker = new kakao.maps.Marker({ position: new kakao.maps.LatLng(place.lat, place.lng), title: place.name });
          kakao.maps.event.addListener(marker, 'click', () => {
            suppressClick.current = true;
            // SDK 가 마커 클릭 뒤 지도 클릭을 이미 막으므로 플래그가 소비되지 않을 수 있다.
            // 남겨 두면 번호 핀을 누른 다음의 첫 점 탭이 삼켜진다 — 같은 이벤트가 끝나면 푼다.
            setTimeout(() => { suppressClick.current = false; }, 0);
            select(place);
          });
          markerByPlaceId.current.set(place.placeId, marker);
        }
        return marker;
      },
    };
  }, []);

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
        placeById.current = new Map(places.map((place) => [place.placeId, place]));
        // 숫자 묶음(클러스터)은 쓰지 않는다. 축소해도 가게마다 제자리에 점으로 찍혀야
        // "어디에 몰려 있는지" 가 보인다(네이버 지도 방식).
        const dots = createDotLayer(kakao, map, mapEl.current, places);
        dotLayerRef.current = dots;

        kakao.maps.event.addListener(map, 'click', (event: KakaoObject) => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          callbacks.current.onClearDiscovery();
          // 점을 정확히 눌렀거나 하나만 걸리면 그 가게, 촘촘한 곳에서 여럿이 애매하게 걸리면 고르게 목록으로.
          const hit = dots.hitTest(event.latLng);
          if (hit.direct || hit.places.length === 1) { setNearby(null); callbacks.current.onSelect(hit.places[0]); return; }
          if (hit.places.length) { setNearby(hit.places.slice(0, 12)); return; }
          const lat = event.latLng.getLat();
          const lng = event.latLng.getLng();
          const radius = nearbyRadiusForLevel(map.getLevel());
          const hits = callbacks.current.places.filter((place) => distanceM(lat, lng, place.lat, place.lng) < radius);
          if (hits.length) { setNearby(hits.slice(0, 12)); return; }
          setNearby(null);
          callbacks.current.onSelect(null);
        });

        // 캔버스 점은 마우스를 올려도 손 모양이 안 된다. 데스크톱에서 누를 수 있다는 걸 보여 준다.
        let hovering = false;
        kakao.maps.event.addListener(map, 'mousemove', (event: KakaoObject) => {
          const over = dots.hitTest(event.latLng).places.length > 0;
          if (over !== hovering) { hovering = over; map.setCursor(over ? 'pointer' : ''); }
        });
        // SDK 는 setCursor 값을 끄는 동안에도 쓴다. 점 위에서 끌기 시작하면 손 모양이 남으므로 되돌린다.
        kakao.maps.event.addListener(map, 'dragstart', () => {
          if (hovering) { hovering = false; map.setCursor(''); }
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
