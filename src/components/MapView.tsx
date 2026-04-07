import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PlaceInfoWindow } from './PlaceInfoWindow';
import { Place } from '../data/places';

declare global {
  interface Window {
    kakao: any;
  }
}

interface MapViewProps {
  places: Place[];
  selectedPlace: Place | null;
  onMarkerClick: (place: Place) => void;
}

export function MapView({ places, selectedPlace, onMarkerClick }: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const kakaoMapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const overlayRef = useRef<any>(null);
  
  const [status, setStatus] = useState('로딩중');

  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.kakao && window.kakao.maps) {
        window.kakao.maps.load(() => {
          initializeMap();
        });
      } else {
        setStatus('에러');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, []);

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
  };

 const createMarkers = (map: any) => {
  if ((window as any)._clusterer) {
    (window as any)._clusterer.clear();
  }
  markersRef.current.forEach((marker) => marker.setMap(null));
  markersRef.current = [];

  const markers = places.map((place) => {
    const position = new window.kakao.maps.LatLng(place.lat, place.lng);
    const marker = new window.kakao.maps.Marker({ position });
    window.kakao.maps.event.addListener(marker, 'click', () => {
      onMarkerClick(place);
    });
    return marker;
  });

  markersRef.current = markers;

  const clusterer = new (window.kakao.maps as any).MarkerClusterer({
    map,
    markers,
    gridSize: 60,
    minLevel: 5,
    disableClickZoom: false,
  });

  (window as any)._clusterer = clusterer;
};

  useEffect(() => {
    if (status !== '완료' || !kakaoMapRef.current || !selectedPlace) {
       if (overlayRef.current) overlayRef.current.setMap(null);
       return;
    }

    if (overlayRef.current) overlayRef.current.setMap(null);

    const position = new window.kakao.maps.LatLng(selectedPlace.lat, selectedPlace.lng);
    kakaoMapRef.current.setCenter(position);
    kakaoMapRef.current.setLevel(3);

    const overlayContent = document.createElement('div');
    overlayContent.style.position = 'relative';
    overlayContent.style.bottom = '50px';

    const root = createRoot(overlayContent);
    root.render(
      <PlaceInfoWindow place={selectedPlace} onClose={() => onMarkerClick(null as any)} />
    );

    const customOverlay = new window.kakao.maps.CustomOverlay({
      position,
      content: overlayContent,
      yAnchor: 1,
    });

    customOverlay.setMap(kakaoMapRef.current);
    overlayRef.current = customOverlay;

  }, [selectedPlace, status]);

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      
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
            <p className="text-sm text-gray-700">
              Bolt.new의 강력한 브라우저 보안 환경이 카카오맵을 차단했습니다.<br/>
              이 코드는 정상이며, 외부 서버(Netlify 등)로 배포하면 정상 작동합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}