// 지도 조립 계층.
// Kakao SDK 초기화·장소 레이어·발견 레이어는 components/map 훅이 맡고,
// 여기서는 로딩/오류/현재위치/주변목록 UI만 렌더한다.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, LocateFixed, X } from 'lucide-react';
import type { Discovered, Place, RatingsMap } from '../types';
import type { SourceMeans } from '../lib/rating';
import { colorOf } from '../lib/categories';
import { useBaseMap } from './map/useBaseMap';
import { usePlaceLayers } from './map/usePlaceLayers';
import { useDiscoveryLayer } from './map/useDiscoveryLayer';
import type { KakaoObject } from './map/types';

const PANEL = 'bg-surface-raised text-fg rounded-xl shadow-xl border border-line';

export interface MapFocus {
  lat: number;
  lng: number;
  radius: number;
  key: number;
}

interface Props {
  places: Place[];
  ratings: RatingsMap;
  means: SourceMeans;
  showGoogle: boolean;
  selectedCategories: string[];
  selectedPlace: Place | null;
  showPopup?: boolean;
  numbered?: string[];
  onSelect: (place: Place | null) => void;
  onDetail: (place: Place) => void;
  onBoundsChange: (visible: Place[], center: { lat: number; lng: number }, level: number) => void;
  initialView?: { c?: { lat: number; lng: number }; z?: number };
  focus: MapFocus | null;
  discovered: Discovered[];
  discoveredRatings: RatingsMap;
  onDiscoveredOpen: (item: Discovered) => void;
  discoverFailed: Set<string>;
  discoverUnavailable: boolean;
  topOffset: number;
  bottomInset: number;
  /** 데스크톱에서 왼쪽을 덮는 패널 폭(px). 고른 가게를 그 오른쪽 빈 지도 가운데에 놓는다. */
  leftInset?: number;
  onStatusChange?: (status: 'loading' | 'ready' | 'error') => void;
}

export function MapView({
  places, ratings, means, showGoogle, selectedCategories, selectedPlace, showPopup = true, numbered,
  onSelect, onDetail, onBoundsChange, initialView, focus, discovered, discoveredRatings,
  onDiscoveredOpen, discoverFailed, discoverUnavailable, topOffset, bottomInset, leftInset = 0, onStatusChange,
}: Props) {
  const [openDiscovered, setOpenDiscovered] = useState<Discovered | null>(null);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const meMarker = useRef<KakaoObject | null>(null);

  const clearDiscovery = useCallback(() => setOpenDiscovered(null), []);
  const base = useBaseMap({ places, initialView, onSelect, onBoundsChange, onClearDiscovery: clearDiscovery });
  const setNearby = base.setNearby;
  const clearNearby = useCallback(() => setNearby(null), [setNearby]);
  const clearTransient = useCallback(() => {
    setNearby(null);
    setOpenDiscovered(null);
  }, [setNearby]);

  usePlaceLayers({
    runtime: base.runtime,
    status: base.status,
    selectedCategories,
    selectedPlace,
    numbered,
    ratings,
    means,
    showGoogle,
    showPopup,
    bottomInset,
    leftInset,
    focus,
    onSelect,
    onDetail,
    onClearTransient: clearTransient,
  });

  useDiscoveryLayer({
    runtime: base.runtime,
    discovered,
    openDiscovered,
    setOpenDiscovered,
    ratings: discoveredRatings,
    failed: discoverFailed,
    unavailable: discoverUnavailable,
    onOpen: onDiscoveredOpen,
    onClearNearby: clearNearby,
  });

  useEffect(() => { onStatusChange?.(base.status); }, [base.status, onStatusChange]);

  const moveToMe = useCallback(() => {
    if (!navigator.geolocation) { setNotice('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const kakao = base.runtime.kakaoRef.current;
        const map = base.runtime.mapRef.current;
        setLocating(false);
        if (!kakao || !map) return;
        const point = new kakao.maps.LatLng(position.coords.latitude, position.coords.longitude);
        meMarker.current?.setMap(null);
        meMarker.current = new kakao.maps.Marker({ position: point, map, title: '현재 위치', zIndex: 5 });
        map.setCenter(point);
        map.setLevel(5);
      },
      () => {
        setNotice('위치를 못 가져왔습니다. 주소창 왼쪽 자물쇠 아이콘 > 위치 > 허용으로 바꾼 뒤 다시 눌러주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [base.runtime]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0" style={{ top: topOffset }}>
        <div ref={base.runtime.mapEl} className="w-full h-full" aria-label="맛집 지도" />
      </div>

      {notice && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-30 ${PANEL} px-4 py-3 max-w-[320px] flex items-start gap-2`}
          style={{ bottom: bottomInset + 16 }}
          role="status"
        >
          <p className="text-sm text-fg-muted flex-1 m-0">{notice}</p>
          <button
            type="button"
            onClick={() => setNotice(null)}
            aria-label="안내 닫기"
            className="grid place-items-center w-11 h-11 -mr-2 -mt-2 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {base.nearby && base.nearby.length > 0 && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-30 ${PANEL} w-72 overflow-hidden`}
          style={{ bottom: bottomInset + 16 }}
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-line-subtle">
            <span className="font-semibold text-sm text-fg">이 근처 {base.nearby.length}곳</span>
            <button
              type="button"
              onClick={clearNearby}
              aria-label="주변 목록 닫기"
              className="grid place-items-center w-11 h-11 -mr-3 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto overscroll-contain m-0 p-0 list-none">
            {base.nearby.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => { onSelect(place); clearNearby(); }}
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

      {base.status === 'ready' && (
        <button
          type="button"
          onClick={moveToMe}
          disabled={locating}
          aria-label="현재 위치로 이동"
          style={{ bottom: bottomInset + 16 }}
          className="absolute right-4 z-10 grid place-items-center w-12 h-12 bg-surface-raised rounded-full shadow-lg hover:bg-surface-pressed transition-colors border border-line disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary-fg animate-spin" aria-hidden="true" />
            : <LocateFixed className="w-5 h-5 text-primary-fg" />}
        </button>
      )}

      {base.status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50" role="status">
          <div className="text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary-fg animate-spin" aria-hidden="true" />
            <p className="text-fg-muted">지도를 불러오는 중</p>
          </div>
        </div>
      )}
      {base.status === 'error' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50 p-6" role="alert">
          <div className={`text-center ${PANEL} p-6 max-w-sm`}>
            <img src={`${import.meta.env.BASE_URL}illust/map-error.svg`} alt="" width={128} height={96} className="mx-auto mb-3" />
            <p className="font-bold text-lg mb-2 text-fg">지도를 불러오지 못했습니다</p>
            <p className="text-sm text-fg-muted m-0">
              이 주소({typeof window !== 'undefined' ? window.location.origin : ''})가 카카오 개발자 콘솔에 등록돼 있는지 확인해 주세요. 네트워크 문제일 수도 있습니다.
            </p>
            <p className="text-sm text-fg-muted m-0 mt-2">목록과 검색은 그대로 쓸 수 있습니다.</p>
            <a
              href={`${import.meta.env.BASE_URL}setup.html`}
              className="mt-4 inline-flex items-center justify-center min-h-11 px-4 rounded-lg bg-primary text-on-primary font-semibold text-sm hover:bg-primary-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              지도 켜는 법 보기
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
