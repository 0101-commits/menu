import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

export function MapView({
  places, selectedPlace, selectedCategories,
  onMarkerClick, onBoundsChange, centerOn, categoryBarHeight = 40
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const markersRef = useRef<{ marker: any; place: Place }[]>([]);
  const overlayRef = useRef<any>(null);
  const clustererRef = useRef<any>(null);
  const searchTimerRef = useRef<any>(null);
  const selectedPlaceRef = useRef<Place | null>(null);

  const [status, setStatus] = useState('로딩중');
  const [locating, setLocating] = useState(false);
  const [popup, setPopup] = useState<KakaoPopup | null>(null);
  const [searching, setSearching] = useState(false);
  const [nearbyList, setNearbyList] = useState<Place[]>([]);
  const [nearbyOpen, setNearbyOpen] = useState(false);

  // selectedPlace를 ref에도 동기화 (클릭 핸들러에서 최신값 참조용)
  useEffect(() => {
    selectedPlaceRef.current = selectedPlace;
  }, [selectedPlace]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => { initializeMap(); });
      } else { setStatus('에러'); }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!kakaoMapRef.current || markersRef.current.length === 0) return;
    if (clustererRef.current) { clustererRef.current.clear(); clustererRef.current = null; }
    const filtered = markersRef.current
      .filter(({ place }) => selectedCategories.length === 0 || selectedCategories.includes(place.category))
      .map(({ marker }) => marker);
    clustererRef.current = new (window.kakao.maps as any).MarkerClusterer({
      map: kakaoMapRef.current, markers: filtered,
      gridSize: 60, minLevel: 5, disableClickZoom: false,
    });
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

    // ★ 마커에 클릭 핸들러 없음 — 지도 클릭 하나로만 처리
    const markerItems = places.map((place) => {
      const marker = new window.kakao.maps.Marker({
        position: new window.kakao.maps.LatLng(place.lat, place.lng)
      });
      return { marker, place };
    });
    markersRef.current = markerItems;

    clustererRef.current = new (window.kakao.maps as any).MarkerClusterer({
      map, markers: markerItems.map((m) => m.marker),
      gridSize: 60, minLevel: 5, disableClickZoom: false,
    });

    // ★ 지도 클릭 하나로 모든 케이스 처리
    window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
      const lat = mouseEvent.latLng.getLat();
      const lng = mouseEvent.latLng.getLng();

      // 진행 중인 검색 취소
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

      const nearby = findNearRegistered(lat, lng, map);

      if (nearby.length === 1) {
        // 등록 가게 1개 → 바로 선택
        setPopup(null); setSearching(false); setNearbyOpen(false);
        onMarkerClick(nearby[0]);

      } else if (nearby.length > 1) {
        // 등록 가게 여러 개 → 선택 목록
        setNearbyList(nearby); setNearbyOpen(true);
        setPopup(null); setSearching(false);

      } else if (selectedPlaceRef.current) {
        // 빈 곳 클릭 + 오버레이 열려있음 → 오버레이만 닫기, 검색 안 함
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
    if (!navigator.geolocation) { alert('위치 서비스를 지원하지 않습니다.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        new window.kakao.maps.Marker({ position, map: kakaoMapRef.current, title: '현재 위치' });
        kakaoMapRef.current.setCenter(position);
        kakaoMapRef.current.setLevel(4);
        setLocating(false);
      },
      () => { alert('위치 권한을 허용해주세요.'); setLocating(false); },
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
    // 카카오 팝업 모두 닫기
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

      {nearbyOpen && nearbyList.length > 0 && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-white rounded-xl shadow-xl border border-gray-200 w-72">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <span className="font-semibold text-sm text-gray-800">이 근처 등록 가게 ({nearbyList.length})</span>
            <button onClick={() => setNearbyOpen(false)} className="text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {nearbyList.map((place) => (
              <button key={place.id}
                onClick={() => { onMarkerClick(place); setNearbyOpen(false); }}
                className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 transition-colors">
                <div className="font-semibold text-sm text-gray-900">{place.name}</div>
                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                  <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 shrink-0">{place.category}</span>
                  <span className="truncate">{place.address}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {(popup || searching) && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white rounded-xl shadow-xl border border-gray-200 p-4 min-w-[260px] max-w-[320px]">
          {searching ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm py-1">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 shrink-0"></div>
              주변 가게 검색 중...
            </div>
          ) : popup ? (
            <>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900 text-base leading-tight">{popup.name}</h3>
                <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">{popup.address}</p>
              <a href={popup.url} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold text-sm px-4 py-2.5 rounded-lg transition-colors w-full">
                <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shrink-0">
                  <span className="text-yellow-400 font-bold text-xs">K</span>
                </div>
                카카오맵에서 보기
              </a>
            </>
          ) : null}
        </div>
      )}

      {status === '완료' && (
        <button onClick={moveToCurrentLocation} disabled={locating}
          className="absolute bottom-16 right-4 z-10 bg-white rounded-full shadow-lg p-3 hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50">
          {locating ? (
            <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
        </button>
      )}

      {status === '로딩중' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">지도를 불러오는 중...</p>
          </div>
        </div>
      )}
      {status === '에러' && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-50">
          <div className="text-center text-red-600 p-6 bg-red-50 rounded-xl shadow-sm border border-red-200">
            <p className="font-bold text-xl mb-2">🚫 외부 스크립트 차단됨</p>
            <p className="text-sm text-gray-700">외부 서버로 배포하면 정상 작동합니다.</p>
          </div>
        </div>
      )}
    </div>
  );
}
