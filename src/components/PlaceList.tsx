import { useState, useMemo, useEffect } from 'react';
import { Place } from '../data/places';
import { places as allPlaces } from '../data/places';

interface PlaceListProps {
  places: Place[];
  totalCount: number;
  onPlaceClick: (place: Place) => void;
  selectedPlaceId: number | null;
  selectedPlace: Place | null;
  onRegionChange: (filtered: Place[], lat: number | null, lng: number | null) => void;
  onResetRegionRef: React.MutableRefObject<(() => void) | null>;
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function openKakaoPlace(place: Place) {
  try {
    const res = await fetch(
      `https://dapi.kakao.com/v2/local/search/keyword.json?query=${encodeURIComponent(place.name)}&x=${place.lng}&y=${place.lat}&radius=300&size=1`,
      { headers: { Authorization: `KakaoAK ${import.meta.env.VITE_KAKAO_REST_API_KEY}` } }
    );
    const data = await res.json();
    if (data.documents?.length > 0) {
      window.open(`https://place.map.kakao.com/${data.documents[0].id}`, '_blank');
    } else {
      window.open(`https://map.kakao.com/?q=${encodeURIComponent(place.name)}`, '_blank');
    }
  } catch {
    window.open(`https://map.kakao.com/?q=${encodeURIComponent(place.name)}`, '_blank');
  }
}

function getGoogleUrl(place: Place) {
  return `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/@${place.lat},${place.lng},17z`;
}

function parseAddress(address: string) {
  const parts = address.trim().split(/\s+/);
  return { large: parts[0] || '', medium: parts[1] || '', small: parts[2] || '' };
}

export function PlaceList({ places, totalCount, onPlaceClick, selectedPlaceId, selectedPlace, onRegionChange, onResetRegionRef }: PlaceListProps) {
  const [selectedLarge, setSelectedLarge] = useState('');
  const [selectedMedium, setSelectedMedium] = useState('');
  const [selectedSmall, setSelectedSmall] = useState('');

  useEffect(() => {
    onResetRegionRef.current = () => { setSelectedLarge(''); setSelectedMedium(''); setSelectedSmall(''); };
  }, [onResetRegionRef]);

  const largeList = useMemo(() => Array.from(new Set(allPlaces.map((p) => parseAddress(p.address).large).filter(Boolean))).sort(), []);
  const mediumList = useMemo(() => {
    const f = selectedLarge ? allPlaces.filter((p) => parseAddress(p.address).large === selectedLarge) : allPlaces;
    return Array.from(new Set(f.map((p) => parseAddress(p.address).medium).filter(Boolean))).sort();
  }, [selectedLarge]);
  const smallList = useMemo(() => {
    const f = allPlaces.filter((p) => {
      const a = parseAddress(p.address);
      if (selectedLarge && a.large !== selectedLarge) return false;
      if (selectedMedium && a.medium !== selectedMedium) return false;
      return true;
    });
    return Array.from(new Set(f.map((p) => parseAddress(p.address).small).filter(Boolean))).sort();
  }, [selectedLarge, selectedMedium]);

  const avg = (arr: Place[], fn: (p: Place) => number) => arr.reduce((s, p) => s + fn(p), 0) / arr.length;

  const handleLargeChange = (val: string) => {
    setSelectedLarge(val); setSelectedMedium(''); setSelectedSmall('');
    if (!val) { onRegionChange([], null, null); return; }
    const f = allPlaces.filter((p) => parseAddress(p.address).large === val);
    onRegionChange(f, avg(f, p => p.lat), avg(f, p => p.lng));
  };
  const handleMediumChange = (val: string) => {
    setSelectedMedium(val); setSelectedSmall('');
    if (!val) { handleLargeChange(selectedLarge); return; }
    const f = allPlaces.filter((p) => { const a = parseAddress(p.address); return a.large === selectedLarge && a.medium === val; });
    onRegionChange(f, avg(f, p => p.lat), avg(f, p => p.lng));
  };
  const handleSmallChange = (val: string) => {
    setSelectedSmall(val);
    if (!val) { handleMediumChange(selectedMedium); return; }
    const f = allPlaces.filter((p) => { const a = parseAddress(p.address); return a.large === selectedLarge && a.medium === selectedMedium && a.small === val; });
    onRegionChange(f, avg(f, p => p.lat), avg(f, p => p.lng));
  };
  const resetRegion = () => { setSelectedLarge(''); setSelectedMedium(''); setSelectedSmall(''); onRegionChange([], null, null); };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-gray-500">
            {selectedPlace ? (
              <span className="text-blue-600 font-semibold">📍 {selectedPlace.name} 주변 거리순</span>
            ) : (
              <><span className="font-bold text-gray-800">{places.length}</span>개 표시 <span className="text-gray-400">/ 총 {totalCount}개</span></>
            )}
          </p>
          {(selectedLarge || selectedMedium || selectedSmall) && (
            <button onClick={resetRegion} className="text-xs text-blue-500 hover:text-blue-700">지역 초기화</button>
          )}
        </div>
        <div className="flex gap-1.5">
          <select value={selectedLarge} onChange={(e) => handleLargeChange(e.target.value)}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400">
            <option value="">시/도</option>
            {largeList.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={selectedMedium} onChange={(e) => handleMediumChange(e.target.value)} disabled={!selectedLarge}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-40">
            <option value="">시/군/구</option>
            {mediumList.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={selectedSmall} onChange={(e) => handleSmallChange(e.target.value)} disabled={!selectedMedium}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-40">
            <option value="">동/읍/면</option>
            {smallList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {places.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">검색 결과가 없습니다</div>
        ) : (
          places.map((place) => (
            <div key={place.id}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedPlaceId === place.id
                  ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => onPlaceClick(place)}>
              <div className="flex justify-between items-start mb-1.5">
                <h3 className="font-bold text-gray-900 text-base">{place.name}</h3>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {selectedPlace && place.id !== selectedPlace.id && (
                    <span className="text-xs text-gray-400">
                      {haversine(selectedPlace.lat, selectedPlace.lng, place.lat, place.lng) < 1
                        ? `${Math.round(haversine(selectedPlace.lat, selectedPlace.lng, place.lat, place.lng) * 1000)}m`
                        : `${haversine(selectedPlace.lat, selectedPlace.lng, place.lat, place.lng).toFixed(1)}km`}
                    </span>
                  )}
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{place.category}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 mb-3">{place.address}</p>
              <div className="flex gap-2">
                <a href={place.naverUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 transition-colors px-3 py-2 rounded-lg flex-1">
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">N</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">네이버</span>
                </a>
                <button onClick={(e) => { e.stopPropagation(); openKakaoPlace(place); }}
                  className="flex items-center justify-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 transition-colors px-3 py-2 rounded-lg flex-1">
                  <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-gray-900 font-bold text-xs">K</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">카카오</span>
                </button>
                <a href={getGoogleUrl(place)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 transition-colors px-3 py-2 rounded-lg flex-1">
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">G</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">구글</span>
                </a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
