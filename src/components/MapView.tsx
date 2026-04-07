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
  onMarkerClick: (place: Place) => void;
  onBoundsChange?: (visiblePlaces: Place[]) => void;
  centerOn?: { lat: number; lng: number; level: number } | null;
}

interface KakaoPopup {
  name: string;
  address: string;
  url: string;
  lat: number;
  lng: number;
}

export function MapView({ places, selectedPlace, onMarkerClick, onBoundsChange, centerOn }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlayRef = useRef<any>(null);
  const mapClickOverlayRef = useRef<any>(null);
  const currentLocationMarkerRef = useRef<any>(null);
  const [status, setStatus] = useState('로딩중');
  const [locating, setLocating] = useState(false);
  const [popup, setPopup] = useState<KakaoPopup | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => { initializeMap(); });
      } else { setStatus('에러'); }
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!centerOn || !kakaoMapRef.current) return;
    kakaoMapRef.current.setCenter(new window.kakao.maps.LatLng(centerOn.lat, centerOn.lng));
    kakaoMapRef.current.setLevel(centerOn.level);
  }, [centerOn]);

  const searchNearbyPlace = async (lat: number, lng: number) => {
    setSearching(true);
    setPopup(null);
    try {
      const res = await fetch(
        `https://dapi.kakao.com/v2/local/search/category.json?category_group_code=FD6,CE7&x=${lng}&y=${lat}&radius=50&size=1`,
        { headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_API_KEY}` } }
      );
      const data = await res.json();
      if (data.documents?.length > 0) {
        const d = data.documents[0];
        setPopup({
          name: d.place_name,
          address: d.road_address_name || d.address_name,
          url: `https://place.map.kakao.com/${d.id}`,
          lat, lng,
        });
      }
    } catch { /* silent */ }
    setSearching(false);
  };

  const initializeMap = () => {
    if (!mapRef.current) return;
    const centerLat = places.length > 0 ? places[0].lat : 37.394776;
    const centerLng = places.length > 0 ? places[0].lng : 127.11116;
    const map = new window.kakao.maps.Map(mapRef.current, {
      center: new window.kakao.maps.LatLng(centerLat, centerLng),
      level: 7,
    });
    kakaoMapRef.current = map;
    setStatus('완료');
    createMarkers(map);

    // 지도 클릭 → 주변 가게 검색
    window.kakao.maps.event.addListener(map, 'click', (mouseEvent: any) => {
      const lat = mouseEvent.latLng.getLat();
      const lng = mouseEvent.latLng.getLng();
      searchNearbyPlace(lat, lng);
    });

    window.kakao.maps.event.addListener(map, 'idle', () => {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      const visible = places.filter((p) => bounds.contain(new window.kakao.maps.LatLng(p.lat, p.lng)));
      onBoundsChange(visible);
    });

    setTimeout(() => {
      if (!onBoundsChange) return;
      const bounds = map.getBounds();
      const visible = places.filter((p) => bounds.contain(new window.kakao.maps.LatLng(p.lat, p.lng)));
      onBoundsChange(visible);
    }, 600);
  };

  const createMarkers = (map: any) => {
    if ((window as any)._clusterer) (window as any)._clusterer.clear();
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    const markers = places.map((place) => {
      const position = new window.kakao.maps.LatLng(place.lat, place.lng);
      const marker = new window.kakao.maps.Marker({ position });
      window.kakao.maps.event.addListener(marker, 'click', () => {
        onMarkerClick(place);
        setPopup(null);
      });
      return marker;
    });
    markersRef.current = markers;
    const clusterer = new (window.kakao.maps as any).MarkerClusterer({
      map, markers, gridSize: 60, minLevel: 5, disableClickZoom: false,
    });
    (window as any)._clusterer = clusterer;
  };

  const moveToCurrentLocation = () => {
    if (!navigator.geolocation) { alert('위치 서비스를 지원하지 않습니다.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const position = new window.kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
        if (currentLocationMarkerRef.current) currentLocationMarkerRef.current.setMap(null);
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
    if (status !== '완료' || !kakaoMapRef.current || !selectedPlace) {
      if (overlayRef.current) overlayRef.current.setMap(null);
      return;
    }
    if (overlayRef.current) overlayRef.current.setMap(null);
    setPopup(null);
    const position = new window.kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng);
    kakaoMapRef.current.setCenter(position);
    kakaoMapRef.current.setLevel(3);
    const overlayContent = document.createElement('div');
    overlayContent.style.position = 'relative';
    overlayContent.style.bottom = '50px';
    const root = createRoot(overlayContent);
    root.render(<PlaceInfoWindow place={selectedPlace} onClose={() => { onMarkerClick(null as any); }} />);
    const customOverlay = new window.kakao.maps.CustomOverlay({ position, content: overlayContent, yAnchor: 1 });
    customOverlay.setMap(kakaoMapRef.current);
    overlayRef.current = customOverlay;
  }, [selectedPlace, status]);

  return (
    <div className="w-full h-full relative">
      <div className="absolute inset-0 top-10">
        <div ref={mapRef} className="w-full h-full" />
      </div>

      {/* 지도 클릭 팝업 */}
      {(popup || searching) && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-20 bg-white rounded-xl shadow-xl border border-gray-200 p-4 min-w-[260px] max-w-[320px]">
          {searching ? (
            <div className="flex items-center gap-2 text-gray-500 text-sm">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              주변 가게 검색 중...
            </div>
          ) : popup ? (
            <>
              <div className="flex justify-between items-start mb-2">
                <h3 className="font-bold text-gray-900 text-base">{popup.name}</h3>
                <button onClick={() => setPopup(null)} className="text-gray-400 hover:text-gray-600 ml-2 shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">{popup.address}</p>
              <a
                href={popup.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-semibold text-sm px-4 py-2 rounded-lg transition-colors w-full"
              >
                <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center">
                  <span className="text-yellow-400 font-bold text-xs">K</span>
                </div>
                카카오맵에서 보기
              </a>
            </>
          ) : null}
        </div>
      )}

      {/* 현재 위치 버튼 */}
      {status === '완료' && (
        <button
          onClick={moveToCurrentLocation}
          disabled={locating}
          className="absolute bottom-16 right-4 z-10 bg-white rounded-full shadow-lg p-3 hover:bg-gray-50 transition-colors border border-gray-200 disabled:opacity-50"
          title="현재 위치로 이동"
        >
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
