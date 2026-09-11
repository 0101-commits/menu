import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Loader2, LocateFixed, X } from 'lucide-react';
import { PlaceInfoWindow } from './PlaceInfoWindow';
import { Place } from '../data/places';

declare global {
  interface Window { kakao: any; }
}

interface MapViewProps {
  places: Place[];
  selectedPlace: Place | null;
  selectedCategories: string[];
  onMarkerClick: (place: Place | null) => void;
  onBoundsChange?: (visiblePlaces: Place[]) => void;
  centerOn?: { lat: number; lng: number; level: number } | null;
  categoryBarHeight?: number;
}

interface KakaoPopup { name: string; address: string; url: string; }

// 지도 위에 뜨는 패널의 공통 외형. 타일이 항상 밝으므로 배경은 불투명하게 둔다.
const PANEL = 'bg-surface-raised text-fg rounded-xl shadow-xl border border-line';

export function MapView({
  places, selectedPlace, selectedCategories,
  onMarkerClick, onBoundsChange, centerOn, categoryBarHeight = 48
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const markersRef = useRef<{ marker: any; place: Place }[]>([]);
  const overlayRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const searchTimerRef = useRef<any>(null);
  const selectedPlaceRef = useRef<Place | null>(null);
  // 마커 클릭 시 지도 click 이벤트 억제용 — 동기적으로 작동
  const suppressMapClickRef = useRef(false);

  const [status, setStatus] = useState('로딩중');
  const [locating, setLocating] = useState(false);
  const [popup, setPopup] = useState<KakaoPopup | null>(null);
  const [searching, setSearching] = useState(false);
  const [nearbyList, setNearbyList] = useState<Place[]>([]);
  const [nearbyOpen, setNearbyOpen] = useState(false);
  // alert() 는 브라우저를 멈춰 세우고 어디서 권한을 켜는지도 알려주지 않는다. 인라인으로 바꾼다.
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => { selectedPlaceRef.current = selectedPlace; }, [selectedPlace]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => { initializeMap(); });
      } else { setStatus('에러'); }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!clustererRef.current || markersRef.current.length === 0) return;
    const allMarkers = markersRef.current.map(({ marker }) => marker);
    const filteredMarkers = markersRef.current
      .filter(({ place }) => selectedCategories.length === 0 || selectedCategories.includes(place.category))
      .map(({ marker }) => marker);
    // 클러스터러 인스턴스 유지 — 마커만 교체 (파괴/재생성 시 충돌 발생)
    clustererRef.current.removeMarkers(allMarkers, true);
    clustererRef.current.addMarkers(filteredMarkers);
  }, [selectedCategories]);

  useEffect(() => {
    if (!centerOn || !kakaoMapRef.current) return;
    kakaoMapRef.current.setCenter(new window.kakao.maps.LatLng(centerOn.lat, centerOn.lng));
    kakaoMapRef.current.setLevel(centerOn.level);
  }, [centerOn]);

  const getDistanceM = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const findNearRegistered = (lat: number, lng: number, map: any): Place[] => {
    const level = map.getLevel();
    const radius = level <= 2 ? 30 : level <= 3 ? 60 : level <= 4 ? 120
      : level <= 5 ? 250 : level <= 6 ? 500 : 800;
    return places.filter((p) => getDistanceM(lat, lng, p.lat, p.lng) < radius);
  };

  const searchKakao = (lat: number, lng: number) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setSearching(true);
    setPopup(null);
    searchTimerRef.current = setTimeout(() => {
      if (!window.kakao?.maps?.services?.Places) { setSearching(false); return; }
      const ps = new window.kakao.maps.services.Places();
      const location = new window.kakao.maps.LatLng(lat, lng);
      let found = false;
      const handle = (results: any[], st: string) => {
        if (found) return;
        if (st === window.kakao.maps.services.Status.OK && results.length > 0) {
          found = true;
          const d = results[0];
          setPopup({ name: d.place_name, address: d.road_address_name || d.address_name, url: `https://place.map.kakao.com/${d.id}` });
        }
        setSearching(false);
      };
      ps.categorySearch('FD6', (r: any[], s: string) => {
        handle(r, s);
        if (!found) ps.categorySearch('CE7', (r2: any[], s2: string) => {
          handle(r2, s2);
          if (!found) setSearching(false);
        }, { location, radius: 150, size: 1 });
      }, { location, radius: 150, size: 1 });
    }, 400);
  };

  const initializeMap = () => {
    if (!mapRef.current) return;
    const map = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(
        places.length > 0 ? places[0].lat : 37.394776,
        places.length > 0 ? places[0].lng : 127.11116
      ),
      level: 7,
    });
    kakaoMapRef.current = map;
    setStatus('완료');

    const markerItems = places.map((place) => {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(place.lat, place.lng)
      });

      window.kakao.maps.event.addListener(marker, 'click', () => {
        // ★ 마커 클릭: 지도 click 이벤트 억제 플래그 설정
        suppressMapClickRef.current = true;
        if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
        setPopup(null); setSearching(false); setNearbyOpen(false);
        onMarkerClick(place);
      });

      return { marker, place };
    });
    markersRef.current = markerItems;

    clustererRef.current = new (window.kakao.maps as any).MarkerClusterer({
      map, markers: markerItems.map((m) => m.marker),
      gridSize: 60, minLevel: 5, disableClickZoom: false,
    });

    window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
      if (suppressMapClickRef.current) {
        suppressMapClickRef.current = false;
        return;
      }

      const lat = mouseEvent.latLng.getLat();
      const lng = mouseEvent.latLng.getLng();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      const nearby = findNearRegistered(lat, lng, map);

      if (nearby.length > 0) {
        // 등록 가게 있으면 항상 목록 표시 (1개여도) → 유저가 직접 선택
        setNearbyList(nearby); setNearbyOpen(true);
        setPopup(null); setSearching(false);
      } else if (selectedPlaceRef.current) {
        // 빈 곳 + 오버레이 열림 → 오버레이 닫기
        setPopup(null); setSearching(false); setNearbyOpen(false);
        onMarkerClick(null);
      } else {
        // 완전히 빈 곳 → 카카오 검색
        setNearbyOpen(false);
        searchKakao(lat, lng);
      }
    });

    window.kakao.maps.event.addListener(map, 'idle', () => {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange(places.filter((p) => bounds.contain(new window.kakao.maps.LatLng(p.lat, p.lng))));
    });
    setTimeout(() => {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      onBoundsChange(places.filter((p) => bounds.contain(new window.kakao.maps.LatLng(p.lat, p.lng))));
    }, 600);
  };

  const moveToCurrentLocation = () => {
    if (!navigator.geolocation) {
      setNotice('이 브라우저는 위치 기능을 지원하지 않습니다.');
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        new window.kakao.maps.Marker({ position, map: kakaoMapRef.current, title: '현재 위치' });
        kakaoMapRef.current.setCenter(position);
        kakaoMapRef.current.setLevel(4);
        setLocating(false);
      },
      () => {
        setNotice('위치를 못 가져왔습니다. 주소창 왼쪽 자물쇠 아이콘 > 위치 > 허용으로 바꾼 뒤 다시 눌러주세요.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (status !== '완료' || !kakaoMapRef.current) return;
    if (!selectedPlace) {
      if (overlayRef.current) { overlayRef.current.setMap(null); overlayRef.current = null; }
      return;
    }
    if (overlayRef.current) { overlayRef.current.setMap(null); overlayRef.current = null; }
    setPopup(null); setSearching(false); setNearbyOpen(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    const position = new window.kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng);
    kakaoMapRef.current.setCenter(position);
    const overlayContent = document.createElement('div');
    overlayContent.style.position = 'relative';
    overlayContent.style.bottom = '50px';
    const root = createRoot(overlayContent);
    root.render(
      <PlaceInfoWindow place={selectedPlace} onClose={() => onMarkerClick(null)} />
    );
    const customOverlay = new window.kakao.maps.CustomOverlay({
      position, content: overlayContent, yAnchor: 1
    });
    customOverlay.setMap(kakaoMapRef.current);
    overlayRef.current = customOverlay;
  }, [selectedPlace, status]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0" style={{ top: categoryBarHeight }}>
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {notice && (
        <div className={`absolute bottom-32 left-1/2 -translate-x-1/2 z-30 ${PANEL} px-4 py-3 max-w-[320px] flex items-start gap-2`} role="status">
          <p className="text-sm text-fg-muted flex-1">{notice}</p>
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

      {nearbyOpen && nearbyList.length > 0 && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-30 ${PANEL} w-72 overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-2 border-b border-line-subtle">
            <span className="font-semibold text-sm text-fg">이 근처 {nearbyList.length}곳</span>
            <button
              type="button"
              onClick={() => setNearbyOpen(false)}
              aria-label="닫기"
              className="grid place-items-center w-11 h-11 -mr-3 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <ul className="max-h-56 overflow-y-auto m-0 p-0 list-none">
            {nearbyList.map((place) => (
              <li key={place.id}>
                <button
                  type="button"
                  onClick={() => { onMarkerClick(place); setNearbyOpen(false); }}
                  className="w-full text-left px-4 py-3 min-h-11 hover:bg-surface-pressed border-b border-line-subtle last:border-0 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="block font-semibold text-sm text-fg">{place.name}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-fg-muted">
                    <span className="bg-surface-fill px-1.5 py-0.5 rounded shrink-0">{place.category}</span>
                    <span className="truncate">{place.address}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(popup || searching) && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-20 ${PANEL} p-4 min-w-[260px] max-w-[320px]`}>
          {searching ? (
            <div className="flex items-center gap-2 text-fg-muted text-sm py-1">
              <Loader2 className="w-4 h-4 shrink-0 animate-spin text-primary-fg" aria-hidden="true" />
              주변 가게를 찾는 중
            </div>
          ) : popup ? (
            <>
              <div className="flex justify-between items-start gap-2 mb-2">
                <h3 className="font-bold text-fg text-base leading-tight">{popup.name}</h3>
                <button
                  type="button"
                  onClick={() => setPopup(null)}
                  aria-label="닫기"
                  className="grid place-items-center w-11 h-11 -mr-2 -mt-2 shrink-0 rounded-lg text-fg-subtle hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-fg-muted mb-3">{popup.address}</p>
              <a
                href={popup.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 min-h-11 px-4 rounded-lg w-full font-semibold text-sm bg-surface-fill hover:bg-surface-pressed text-fg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <span
                  aria-hidden="true"
                  className="grid place-items-center w-5 h-5 rounded-full shrink-0 text-xs font-bold"
                  style={{ background: 'var(--matpin-brand-kakao)', color: '#111' }}
                >K</span>
                카카오맵에서 보기
              </a>
            </>
          ) : null}
        </div>
      )}

      {status === '완료' && (
        <button
          type="button"
          onClick={moveToCurrentLocation}
          disabled={locating}
          aria-label="현재 위치로 이동"
          className="absolute bottom-16 right-4 z-10 grid place-items-center w-12 h-12 bg-surface-raised rounded-full shadow-lg hover:bg-surface-pressed transition-colors border border-line disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {locating
            ? <Loader2 className="w-5 h-5 text-primary-fg animate-spin" />
            : <LocateFixed className="w-5 h-5 text-primary-fg" />}
        </button>
      )}

      {status === '로딩중' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50">
          <div className="text-center">
            <Loader2 className="w-10 h-10 mx-auto mb-4 text-primary-fg animate-spin" aria-hidden="true" />
            <p className="text-fg-muted">지도를 불러오는 중</p>
          </div>
        </div>
      )}
      {status === '에러' && (
        <div className="absolute inset-0 grid place-items-center bg-surface-sunken z-50 p-6">
          <div className={`text-center ${PANEL} p-6 max-w-sm`}>
            <p className="font-bold text-lg mb-2 text-fg">지도를 불러오지 못했습니다</p>
            <p className="text-sm text-fg-muted">
              네트워크 연결을 확인한 뒤 새로고침해 주세요. 목록과 검색은 그대로 쓸 수 있습니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
