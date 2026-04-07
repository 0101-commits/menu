import { useState, useMemo, useCallback, useRef } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin, Search, X } from 'lucide-react';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number; level: number } | null>(null);
  const [regionFilteredPlaces, setRegionFilteredPlaces] = useState<Place[] | null>(null);
  const resetRegionRef = useRef<(() => void) | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(places.map((p) => p.category))).sort();
  }, []);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  // 마커 클릭 시: 지역 필터 초기화 + 해당 가게 지도 표시
  const handlePlaceClick = useCallback((place: Place | null) => {
    setSelectedPlace(place);
    if (place) {
      // 지역 필터 해제 → 지도 범위 기준으로 복귀
      setRegionFilteredPlaces(null);
      // PlaceList 내부 지역 드롭다운도 초기화
      resetRegionRef.current?.();
    }
  }, []);

  const handleRegionChange = useCallback((
    filtered: Place[],
    lat: number | null,
    lng: number | null
  ) => {
    if (lat !== null && lng !== null) {
      setCenterOn({ lat, lng, level: 7 });
      setRegionFilteredPlaces(filtered);
    } else {
      setRegionFilteredPlaces(null);
    }
  }, []);

  // 리스트 기준: 지역 필터 > 지도 범위
  const baseList = regionFilteredPlaces ?? visiblePlaces;

  const filteredPlaces = useMemo(() => {
    let list = baseList.filter((p) => {
      const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
      const matchSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });

    // 선택된 가게가 목록에 없으면 맨 위에 추가
    if (selectedPlace && !list.find((p) => p.id === selectedPlace.id)) {
      list = [selectedPlace, ...list];
    }

    return list;
  }, [baseList, selectedCategories, searchQuery, selectedPlace]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">

      {/* 사이드바 */}
      <div className="lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:w-96 lg:z-10 h-64 lg:h-auto w-full flex flex-col bg-white shadow-xl lg:rounded-xl overflow-hidden">
        <div className="px-4 pt-3 pb-2 bg-blue-600 text-white shrink-0 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          <span className="font-bold text-sm">나만의 맛집 평점 지도</span>
        </div>
        <div className="p-3 border-b border-gray-100 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="식당 이름, 주소 검색"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          <PlaceList
            places={filteredPlaces}
            totalCount={places.length}
            onPlaceClick={handlePlaceClick}
            selectedPlaceId={selectedPlace?.id ?? null}
            onRegionChange={handleRegionChange}
            onResetRegionRef={resetRegionRef}
          />
        </div>
      </div>

      {/* 지도 영역 */}
      <div className="flex-1 relative">
        <div className="absolute top-0 left-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 lg:left-[416px]">
          <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedCategories([])}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                selectedCategories.length === 0
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              전체
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${
                  selectedCategories.includes(cat)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}
              >
                {cat}{selectedCategories.includes(cat) && ' ✓'}
              </button>
            ))}
          </div>
        </div>

        <MapView
          places={places}
          selectedPlace={selectedPlace}
          onMarkerClick={handlePlaceClick}
          onBoundsChange={(vp) => { if (!regionFilteredPlaces) setVisiblePlaces(vp); }}
          centerOn={centerOn}
        />
      </div>
    </div>
  );
}
