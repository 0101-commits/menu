import { useState, useMemo } from 'react';
import { Place } from '../data/places';

interface PlaceListProps {
  places: Place[];
  onPlaceClick: (place: Place) => void;
  selectedPlaceId: number | null;
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
  return {
    large: parts[0] || '',
    medium: parts[1] || '',
    small: parts[2] || '',
  };
}

export function PlaceList({ places, onPlaceClick, selectedPlaceId }: PlaceListProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('전체');
  const [selectedLarge, setSelectedLarge] = useState<string>('');
  const [selectedMedium, setSelectedMedium] = useState<string>('');
  const [selectedSmall, setSelectedSmall] = useState<string>('');

  // 카테고리 목록
  const categories = useMemo(() => {
    const cats = Array.from(new Set(places.map((p) => p.category))).sort();
    return ['전체', ...cats];
  }, [places]);

  // 대분류 목록 (시/도)
  const largeList = useMemo(() => {
    const set = new Set(places.map((p) => parseAddress(p.address).large).filter(Boolean));
    return Array.from(set).sort();
  }, [places]);

  // 중분류 목록 (시/군/구) — 대분류 선택 시 필터
  const mediumList = useMemo(() => {
    const filtered = selectedLarge
      ? places.filter((p) => parseAddress(p.address).large === selectedLarge)
      : places;
    const set = new Set(filtered.map((p) => parseAddress(p.address).medium).filter(Boolean));
    return Array.from(set).sort();
  }, [places, selectedLarge]);

  // 소분류 목록 (구/동) — 중분류 선택 시 필터
  const smallList = useMemo(() => {
    const filtered = places.filter((p) => {
      const addr = parseAddress(p.address);
      if (selectedLarge && addr.large !== selectedLarge) return false;
      if (selectedMedium && addr.medium !== selectedMedium) return false;
      return true;
    });
    const set = new Set(filtered.map((p) => parseAddress(p.address).small).filter(Boolean));
    return Array.from(set).sort();
  }, [places, selectedLarge, selectedMedium]);

  // 최종 필터링
  const filtered = useMemo(() => {
    return places.filter((p) => {
      const addr = parseAddress(p.address);
      if (selectedCategory !== '전체' && p.category !== selectedCategory) return false;
      if (selectedLarge && addr.large !== selectedLarge) return false;
      if (selectedMedium && addr.medium !== selectedMedium) return false;
      if (selectedSmall && addr.small !== selectedSmall) return false;
      return true;
    });
  }, [places, selectedCategory, selectedLarge, selectedMedium, selectedSmall]);

  const resetRegion = () => {
    setSelectedLarge('');
    setSelectedMedium('');
    setSelectedSmall('');
  };

  return (
    <div className="h-full bg-white flex flex-col shadow-lg overflow-hidden lg:rounded-none">
      {/* 헤더 */}
      <div className="p-4 bg-blue-600 text-white shrink-0">
        <h2 className="text-xl font-bold">맛집 리스트</h2>
        <p className="text-blue-100 text-xs mt-0.5">
          {filtered.length}개 표시 / 총 {places.length}개
        </p>
      </div>

      {/* 카테고리 필터 */}
      <div className="shrink-0 px-3 pt-3 pb-2 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-2">카테고리</p>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 지역 필터 */}
      <div className="shrink-0 px-3 pt-2 pb-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500">지역</p>
          {(selectedLarge || selectedMedium || selectedSmall) && (
            <button
              onClick={resetRegion}
              className="text-xs text-blue-500 hover:text-blue-700"
            >
              초기화
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {/* 대분류 */}
          <select
            value={selectedLarge}
            onChange={(e) => {
              setSelectedLarge(e.target.value);
              setSelectedMedium('');
              setSelectedSmall('');
            }}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400"
          >
            <option value="">시/도</option>
            {largeList.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          {/* 중분류 */}
          <select
            value={selectedMedium}
            onChange={(e) => {
              setSelectedMedium(e.target.value);
              setSelectedSmall('');
            }}
            disabled={!selectedLarge}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-40"
          >
            <option value="">시/군/구</option>
            {mediumList.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* 소분류 */}
          <select
            value={selectedSmall}
            onChange={(e) => setSelectedSmall(e.target.value)}
            disabled={!selectedMedium}
            className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-blue-400 disabled:opacity-40"
          >
            <option value="">동/읍/면</option>
            {smallList.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* 리스트 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
            검색 결과가 없습니다
          </div>
        ) : (
          filtered.map((place) => (
            <div
              key={place.id}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                selectedPlaceId === place.id
                  ? 'border-blue-500 bg-blue-50 shadow-md ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
              }`}
              onClick={() => onPlaceClick(place)}
            >
              <div className="flex justify-between items-start mb-1.5">
                <h3 className="font-bold text-gray-900 text-base">{place.name}</h3>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0 ml-2">
                  {place.category}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{place.address}</p>
              <div className="flex gap-2">
                {/* 네이버 */}
                <a
                  href={place.naverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 transition-colors px-3 py-2 rounded-lg flex-1"
                >
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-xs">N</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">네이버</span>
                </a>
                {/* 카카오 */}
                <button
                  onClick={(e) => { e.stopPropagation(); openKakaoPlace(place); }}
                  className="flex items-center justify-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 transition-colors px-3 py-2 rounded-lg flex-1"
                >
                  <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                    <span className="text-gray-900 font-bold text-xs">K</span>
                  </div>
                  <span className="text-xs font-semibold text-gray-700">카카오</span>
                </button>
                {/* 구글 */}
                <a
                  href={getGoogleUrl(place)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 transition-colors px-3 py-2 rounded-lg flex-1"
                >
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
