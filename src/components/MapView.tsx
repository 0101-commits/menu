// 지도.
//
// 바뀐 것
//   마커가 대분류 색군(6+1)으로 나뉜다. 4,084 개가 전부 같은 핀이면 지도에서 읽을 게 없다.
//   핀 레드는 "선택됨" 전용으로 남긴다 — 그래서 색군에 빨강이 없다.
//   SDK 를 500ms 한 번이 아니라 10초까지 기다린다(lib/kakao.ts).
//   반경 검색이면 원을 그리고 그 범위로 줌을 맞춘다. 레벨 7 고정을 없앴다.
//   발견 모드의 미저장 가게는 점선 테두리의 작은 마커로, 저장분과 섞이지 않게 둔다.
//
// 오버레이는 React root 를 하나만 만들어 재사용한다. 선택할 때마다 createRoot 하면
// 루트가 쌓여 메모리를 잡는다.

import { useEffect, useRef, useState, useCallback } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { Loader2, LocateFixed, X, Compass } from 'lucide-react';
import { PlaceInfoWindow } from './PlaceInfoWindow';
import { DiscoveredWindow } from './DiscoveredWindow';
import type { Discovered, Place, RatingsMap } from '../types';
import { loadKakao, type KakaoNS } from '../lib/kakao';
import { colorOf, CATEGORY_GROUPS, OTHER_GROUP } from '../lib/categories';
import { distanceM, levelForRadius } from '../lib/geo';
import type { SourceMeans } from '../lib/rating';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PANEL = 'bg-surface-raised text-fg rounded-xl shadow-xl border border-line';

// ---------- 마커 그림 ----------
// 색군마다 핀을 하나씩 만든다. 4,084 개 마커가 이 7 장을 공유한다.
function pinSvg(color: string, selected: boolean) {
  const w = selected ? 32 : 24;
  const h = selected ? 44 : 34;
  const stroke = selected ? '#ffffff' : '#ffffff';
  return (
    `data:image/svg+xml;charset=UTF-8,` +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 24 34">` +
        `<path d="M12 1C6.2 1 1.5 5.7 1.5 11.5c0 7.9 9.2 19.6 10.1 20.8.2.3.6.3.8 0C13.3 31.1 22.5 19.4 22.5 11.5 22.5 5.7 17.8 1 12 1z" ` +
        `fill="${color}" stroke="${stroke}" stroke-width="2"/>` +
        `<circle cx="12" cy="11.5" r="4" fill="#ffffff"/>` +
      `</svg>`,
    )
  );
}

function discoveredSvg() {
  return (
    `data:image/svg+xml;charset=UTF-8,` +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">` +
        `<circle cx="8" cy="8" r="6" fill="#ffffff" stroke="#6b7280" stroke-width="2" stroke-dasharray="2.6 2"/>` +
      `</svg>`,
    )
  );
}

interface Images {
  normal: Map<string, any>;
  selected: Map<string, any>;
  discovered: any;
}

function buildImages(kakao: KakaoNS): Images {
  const normal = new Map<string, any>();
  const selected = new Map<string, any>();
  for (const g of [...CATEGORY_GROUPS, OTHER_GROUP]) {
    normal.set(
      g.color,
      new kakao.maps.MarkerImage(pinSvg(g.color, false), new kakao.maps.Size(24, 34), {
        offset: new kakao.maps.Point(12, 34),
      }),
    );
    selected.set(
      g.color,
      new kakao.maps.MarkerImage(pinSvg('#c8362a', true), new kakao.maps.Size(32, 44), {
        offset: new kakao.maps.Point(16, 44),
      }),
    );
  }
  return {
    normal,
    selected,
    discovered: new kakao.maps.MarkerImage(discoveredSvg(), new kakao.maps.Size(16, 16), {
      offset: new kakao.maps.Point(8, 8),
    }),
  };
}

const CLUSTER_STYLES = [
  { width: '36px', height: '36px', background: 'rgba(58,63,71,.88)', borderRadius: '18px', color: '#fff', textAlign: 'center', lineHeight: '36px', fontSize: '12px', fontWeight: '700' },
  { width: '44px', height: '44px', background: 'rgba(58,63,71,.9)', borderRadius: '22px', color: '#fff', textAlign: 'center', lineHeight: '44px', fontSize: '13px', fontWeight: '700' },
  { width: '54px', height: '54px', background: 'rgba(40,44,51,.92)', borderRadius: '27px', color: '#fff', textAlign: 'center', lineHeight: '54px', fontSize: '14px', fontWeight: '700' },
];

// ---------- 컴포넌트 ----------

export interface MapFocus {
  lat: number;
  lng: number;
  /** m. 0 이면 원을 그리지 않고 이동만 한다. */
  radius: number;
  /** 같은 좌표를 다시 눌러도 반응해야 해서 매번 바뀌는 값을 둔다. */
  key: number;
}

interface Props {
  places: Place[];
  ratings: RatingsMap;
  means: SourceMeans;
  googleEnabled: boolean;
  selectedCategories: string[];
  selectedPlace: Place | null;
  onSelect: (p: Place | null) => void;
  onDetail: (p: Place) => void;
  onBoundsChange: (visible: Place[], center: { lat: number; lng: number }) => void;
  focus: MapFocus | null;
  discovered: Discovered[];
  discoveredRatings: RatingsMap;
  onDiscoveredOpen: (d: Discovered) => void;
  discoverUnavailable: boolean;
  topOffset: number;
  onStatusChange?: (s: 'loading' | 'ready' | 'error') => void;
}

export function MapView({
  places, ratings, means, googleEnabled, selectedCategories, selectedPlace,
  onSelect, onDetail, onBoundsChange, focus, discovered, discoveredRatings,
  onDiscoveredOpen, discoverUnavailable, topOffset, onStatusChange,
}: Props) {
  const mapEl = useRef<HTMLDivElement>(null);
  const kakaoRef = useRef<KakaoNS>(null);
  const mapRef = useRef<any>(null);
  const imagesRef = useRef<Images | null>(null);
  const markersRef = useRef<{ marker: any; place: Place }[]>([]);
  const markerBySid = useRef(new Map<string, any>());
  const clustererRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const meMarkerRef = useRef<any>(null);
  const discMarkersRef = useRef<any[]>([]);
  const prevSelectedRef = useRef<Place | null>(null);
  // 마커 클릭이 지도 클릭으로도 잡히는 것을 막는다. 동기적으로 읽혀야 해서 ref 다.
  const suppressClick = useRef(false);

  // 오버레이는 하나씩만 만들고 내용만 갈아 끼운다.
  const infoRef = useRef<{ overlay: any; root: Root; el: HTMLDivElement } | null>(null);
  const discRef = useRef<{ overlay: any; root: Root; el: HTMLDivElement } | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [nearby, setNearby] = useState<Place[] | null>(null);
  const [openDiscovered, setOpenDiscovered] = useState<Discovered | null>(null);

  // 콜백을 지도 이벤트 안에서 쓰려면 최신 값을 ref 로 들고 있어야 한다.
  // 이벤트 리스너는 한 번만 붙고 클로저는 그때 값을 가둔다.
  const cb = useRef({ onSelect, onBoundsChange, places, onDiscoveredOpen });
  cb.current = { onSelect, onBoundsChange, places, onDiscoveredOpen };

  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  // ---------- 초기화 ----------
  useEffect(() => {
    let cancelled = false;

    loadKakao()
      .then((kakao) => {
        if (cancelled || !mapEl.current) return;
        kakaoRef.current = kakao;
        imagesRef.current = buildImages(kakao);

        const first = places[0];
        const map = new kakao.maps.Map(mapEl.current, {
          center: new kakao.maps.LatLng(first?.lat ?? 37.5665, first?.lng ?? 126.978),
          level: 7,
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
            setOpenDiscovered(null);
            cb.current.onSelect(place);
          });
          markerBySid.current.set(place.placeId, marker);
          return { marker, place };
        });
        markersRef.current = items;

        clustererRef.current = new (kakao.maps as any).MarkerClusterer({
          map,
          markers: items.map((i) => i.marker),
          gridSize: 60,
          minLevel: 5,
          disableClickZoom: false,
          styles: CLUSTER_STYLES,
          calculator: [10, 100],
        });

        // 지도 빈 곳 클릭
        kakao.maps.event.addListener(map, 'click', (e: any) => {
          if (suppressClick.current) { suppressClick.current = false; return; }
          setOpenDiscovered(null);

          const lat = e.latLng.getLat();
          const lng = e.latLng.getLng();
          const level = map.getLevel();
          const radius = level <= 2 ? 30 : level <= 3 ? 60 : level <= 4 ? 120 : level <= 5 ? 250 : level <= 6 ? 500 : 800;
          const hits = cb.current.places.filter((p) => distanceM(lat, lng, p.lat, p.lng) < radius);

          if (hits.length) { setNearby(hits.slice(0, 12)); return; }
          setNearby(null);
          cb.current.onSelect(null);
        });

        const report = () => {
          const b = map.getBounds();
          const c = map.getCenter();
          cb.current.onBoundsChange(
            cb.current.places.filter((p) => b.contain(new kakao.maps.LatLng(p.lat, p.lng))),
            { lat: c.getLat(), lng: c.getLng() },
          );
        };
        kakao.maps.event.addListener(map, 'idle', report);
        setTimeout(report, 300);

        setStatus('ready');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });

    return () => { cancelled = true; };
    // places 는 앱 수명 동안 한 번만 바뀐다(로딩 완료 시). 마커를 다시 만들 일이 없다.
  }, [places]);

  // ---------- 카테고리 필터 ----------
  useEffect(() => {
    const clusterer = clustererRef.current;
    if (!clusterer || markersRef.current.length === 0) return;
    const all = markersRef.current.map((m) => m.marker);
    const on = markersRef.current
      .filter(({ place }) => selectedCategories.length === 0 || selectedCategories.includes(place.category))
      .map((m) => m.marker);
    // 인스턴스를 유지하고 마커만 교체한다. 파괴·재생성은 충돌한다.
    clusterer.removeMarkers(all, true);
    clusterer.addMarkers(on);
  }, [selectedCategories]);

  // ---------- 선택 ----------
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    const images = imagesRef.current;
    if (!kakao || !map || !images || status !== 'ready') return;

    // 이전 선택 마커를 원래 그림으로
    const prev = prevSelectedRef.current;
    if (prev) {
      const m = markerBySid.current.get(prev.placeId);
      m?.setImage(images.normal.get(colorOf(prev.category)));
      m?.setZIndex(0);
    }
    prevSelectedRef.current = selectedPlace;

    if (!selectedPlace) {
      infoRef.current?.overlay.setMap(null);
      return;
    }

    setNearby(null);
    setOpenDiscovered(null);

    const marker = markerBySid.current.get(selectedPlace.placeId);
    marker?.setImage(images.selected.get(colorOf(selectedPlace.category)));
    marker?.setZIndex(10);

    const position = new kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng);
    map.setCenter(position);

    if (!infoRef.current) {
      const el = document.createElement('div');
      el.style.position = 'relative';
      el.style.bottom = '48px';
      infoRef.current = {
        el,
        root: createRoot(el),
        overlay: new kakao.maps.CustomOverlay({ position, content: el, yAnchor: 1, zIndex: 20 }),
      };
    }
    const info = infoRef.current;
    info.root.render(
      <PlaceInfoWindow
        place={selectedPlace}
        ratings={ratings[selectedPlace.placeId]}
        means={means}
        googleEnabled={googleEnabled}
        onClose={() => cb.current.onSelect(null)}
        onDetail={onDetail}
      />,
    );
    info.overlay.setPosition(position);
    info.overlay.setMap(map);
  }, [selectedPlace, status, ratings, means, googleEnabled, onDetail]);

  // ---------- 반경·이동 ----------
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map || !focus) return;

    circleRef.current?.setMap(null);
    circleRef.current = null;

    const center = new kakao.maps.LatLng(focus.lat, focus.lng);
    if (focus.radius > 0) {
      const circle = new kakao.maps.Circle({
        center,
        radius: focus.radius,
        strokeWeight: 2,
        strokeColor: '#c8362a',
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
        fillColor: '#c8362a',
        fillOpacity: 0.06,
      });
      circle.setMap(map);
      circleRef.current = circle;
      const b = circle.getBounds?.();
      if (b) map.setBounds(b);
      else { map.setCenter(center); map.setLevel(levelForRadius(focus.radius)); }
    } else {
      map.setCenter(center);
    }
  }, [focus]);

  // ---------- 발견 마커 ----------
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    const images = imagesRef.current;
    if (!kakao || !map || !images) return;

    for (const m of discMarkersRef.current) m.setMap(null);
    discMarkersRef.current = [];

    for (const d of discovered) {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(d.lat, d.lng),
        image: images.discovered,
        title: d.name,
        zIndex: 1,
      });
      kakao.maps.event.addListener(marker, 'click', () => {
        suppressClick.current = true;
        setNearby(null);
        setOpenDiscovered(d);
        cb.current.onDiscoveredOpen(d);
      });
      marker.setMap(map);
      discMarkersRef.current.push(marker);
    }

    return () => {
      for (const m of discMarkersRef.current) m.setMap(null);
      discMarkersRef.current = [];
    };
  }, [discovered]);

  // ---------- 발견 오버레이 ----------
  useEffect(() => {
    const kakao = kakaoRef.current;
    const map = mapRef.current;
    if (!kakao || !map) return;

    if (!openDiscovered) {
      discRef.current?.overlay.setMap(null);
      return;
    }
    const position = new kakao.maps.LatLng(openDiscovered.lat, openDiscovered.lng);
    if (!discRef.current) {
      const el = document.createElement('div');
      el.style.position = 'relative';
      el.style.bottom = '26px';
      discRef.current = {
        el,
        root: createRoot(el),
        overlay: new kakao.maps.CustomOverlay({ position, content: el, yAnchor: 1, zIndex: 20 }),
      };
    }
    const d = discRef.current;
    const key = `k:${openDiscovered.kakaoId}`;
    d.root.render(
      <DiscoveredWindow
        item={openDiscovered}
        ratings={discoveredRatings[key]}
        loading={!discoverUnavailable && !discoveredRatings[key]}
        unavailable={discoverUnavailable}
        onClose={() => setOpenDiscovered(null)}
      />,
    );
    d.overlay.setPosition(position);
    d.overlay.setMap(map);
  }, [openDiscovered, discoveredRatings, discoverUnavailable]);

  // 언마운트 시 React root 정리. 렌더 중 unmount 경고를 피하려고 다음 틱으로 미룬다.
  useEffect(
    () => () => {
      const roots = [infoRef.current, discRef.current];
      setTimeout(() => { for (const r of roots) r?.root.unmount(); }, 0);
    },
    [],
  );

  const moveToMe = useCallback(() => {
    if (!navigator.geolocation) { setNotice('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const kakao = kakaoRef.current;
        const map = mapRef.current;
        setLocating(false);
        if (!kakao || !map) return;
        const position = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        meMarkerRef.current?.setMap(null);
        meMarkerRef.current = new kakao.maps.Marker({ position, map, title: '현재 위치', zIndex: 5 });
        map.setCenter(position);
        map.setLevel(5);
      },
      () => {
        setNotice('위치를 못 가져왔습니다. 주소창 왼쪽 자물쇠 아이콘 > 위치 > 허용으로 바꾼 뒤 다시 눌러주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, []);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0" style={{ top: topOffset }}>
        <div ref={mapEl} className="w-full h-full" />
      </div>

      {notice && (
        <div className={`absolute bottom-32 left-1/2 -translate-x-1/2 z-30 ${PANEL} px-4 py-3 max-w-[320px] flex items-start gap-2`} role="status">
          <p className="text-sm text-fg-muted flex-1 m-0">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="안내 닫기"
            className="grid place-items-center w-8 h-8 -mr-1 -mt-1 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {nearby && nearby.length > 0 && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-30 ${PANEL} w-72 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-line-subtle">
            <span className="font-semibold text-sm text-fg">이 근처 {nearby.length}곳</span>
            <button
              type="button"
              onClick={() => setNearby(null)}
              aria-label="닫기"
              className="grid place-items-center w-11 h-11 -mr-3 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto m-0 p-0 list-none">
            {nearby.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => { onSelect(place); setNearby(null); }}
                  className="w-full text-left px-4 py-3 min-h-11 hover:bg-surface-pressed border-b border-line-subtle last:border-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(place.category) }} />
                    <span className="font-semibold text-sm text-fg truncate">{place.name}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-fg-muted truncate">{place.mcidName || place.category}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === 'ready' && (
        <button
          type="button"
          onClick={moveToMe}
          disabled={locating}
          aria-label="현재 위치로 이동"
          className="absolute bottom-16 right-4 z-10 grid place-items-center w-12 h-12 bg-surface-raised rounded-full shadow-lg hover:bg-surface-pressed transition-colors border border-line disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary-fg animate-spin" />
            : <LocateFixed className="w-5 h-5 text-primary-fg" />}
        </button>
      )}

      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50">
          <div className="text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary-fg animate-spin" aria-hidden="true" />
            <p className="text-fg-muted">지도를 불러오는 중</p>
          </div>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50 p-6">
          <div className={`text-center ${PANEL} p-6 max-w-sm`}>
            <Compass className="w-8 h-8 mx-auto mb-3 text-fg-subtle" aria-hidden="true" />
            <p className="font-bold text-lg mb-2 text-fg">지도를 불러오지 못했습니다</p>
            <p className="text-sm text-fg-muted m-0">
              네트워크 연결을 확인한 뒤 새로고침해 주세요. 목록과 검색은 그대로 쓸 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
