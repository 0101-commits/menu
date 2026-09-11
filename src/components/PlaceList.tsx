import { useState, useMemo, useEffect } from 'react';
import { Place, places as allPlaces } from '../data/places';
import { PlaceLinks } from './PlaceLinks';

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

function formatDistance(km: number) {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

function parseAddress(address: string) {
  const parts = address.trim().split(/\s+/);
  return { large: parts[0] || '', medium: parts[1] || '', small: parts[2] || '' };
}

const SELECT_CLASS =
  'flex-1 min-w-0 text-sm min-h-11 rounded-lg px-2 bg-surface text-fg ' +
  'border border-line focus:outline-none focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40';

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

  const regionActive = Boolean(selectedLarge || selectedMedium || selectedSmall);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-3 border-b border-line-subtle shrink-0">
        <div className="flex items-center justify-between gap-2 mb-2 min-h-8">
          <p className="text-sm text-fg-muted truncate">
            {selectedPlace ? (
              <span className="text-primary-fg font-semibold">{selectedPlace.name} 주변 가까운 순</span>
            ) : (
              <>
                <span className="font-bold text-fg">{places.length.toLocaleString()}</span>곳 보임
                <span className="text-fg-subtle"> · 전체 {totalCount.toLocaleString()}곳</span>
              </>
            )}
          </p>
          {regionActive && (
            <button
              type="button"
              onClick={resetRegion}
              className="shrink-0 text-sm text-primary-fg hover:underline min-h-11 px-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded"
            >
              지역 해제
            </button>
          )}
        </div>
        <div className="flex gap-1.5">
          <label className="sr-only" htmlFor="region-large">시/도</label>
          <select id="region-large" value={selectedLarge} onChange={(e) => handleLargeChange(e.target.value)} className={SELECT_CLASS}>
            <option value="">시/도</option>
            {largeList.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <label className="sr-only" htmlFor="region-medium">시/군/구</label>
          <select id="region-medium" value={selectedMedium} onChange={(e) => handleMediumChange(e.target.value)} disabled={!selectedLarge} className={SELECT_CLASS}>
            <option value="">시/군/구</option>
            {mediumList.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <label className="sr-only" htmlFor="region-small">동/읍/면</label>
          <select id="region-small" value={selectedSmall} onChange={(e) => handleSmallChange(e.target.value)} disabled={!selectedMedium} className={SELECT_CLASS}>
            <option value="">동/읍/면</option>
            {smallList.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <ul className="flex-1 overflow-y-auto p-3 flex flex-col gap-3 m-0 list-none">
        {places.length === 0 ? (
          <li className="grid place-items-center h-32 text-fg-subtle text-sm">찾는 맛집이 없습니다</li>
        ) : (
          places.map((place) => {
            const selected = selectedPlaceId === place.id;
            const distance = selectedPlace && place.id !== selectedPlace.id
              ? formatDistance(haversine(selectedPlace.lat, selectedPlace.lng, place.lat, place.lng))
              : null;
            return (
              <li
                key={place.id}
                className={`rounded-xl border transition-colors ${
                  selected ? 'border-primary bg-primary-weak' : 'border-line bg-surface hover:bg-surface-pressed'
                }`}
              >
                {/* 카드 전체를 버튼으로 감싸면 안의 외부 링크가 중첩된다.
                    제목 줄만 버튼으로 두고 링크는 형제로 남긴다. */}
                <button
                  type="button"
                  onClick={() => onPlaceClick(place)}
                  aria-pressed={selected}
                  className="w-full text-left px-4 pt-4 pb-2 rounded-t-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
                >
                  <span className="flex justify-between items-start gap-2 mb-1.5">
                    <span className="font-bold text-fg text-base">{place.name}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      {distance && <span className="text-xs text-fg-subtle">{distance}</span>}
                      <span className="text-xs bg-surface-fill text-fg-muted px-2 py-0.5 rounded-full font-medium">{place.category}</span>
                    </span>
                  </span>
                  <span className="block text-sm text-fg-muted">{place.address}</span>
                  {place.mcidName && <span className="block text-xs text-fg-subtle mt-0.5">{place.mcidName}</span>}
                </button>
                <div className="px-4 pb-4 pt-2">
                  <PlaceLinks place={place} />
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
