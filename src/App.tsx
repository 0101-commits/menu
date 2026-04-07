import { useState, useMemo, useCallback, useRef } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number; level: number } | null>(null);
  const [regionFilteredPlaces, setRegionFilteredPlaces] = useState<Place[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const resetRegionRef = useRef<(() => void) | null>(null);

  const categories = useMemo(() => {
    return Array.from(new Set(places.map((p) => p.category))).sort();
  }, []);

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handlePlaceClick = useCallback((place: Place | null) => {
    setSelectedPlace(place);
    if (place) {
      setRegionFilteredPlaces(null);
      resetRegionRef.current?.();
      setSidebarOpen(true); // 가게 클릭 시 사이드바 자동 열기
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
    if (selectedPlace && !list.find((p) => p.id === selectedPlace.id)) {
      list = [selectedPlace, ...list];
    }
    return list;
  }, [baseList, selectedCategories, searchQuery, selectedPlace]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">

      {/* ── 사이드바 ── */}
      <div
        className={`lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:z-10 lg:h-auto flex flex-col bg-white shadow-xl lg:rounded-xl overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'lg:w-96 h-64' : 'lg:w-12 h-12 lg:h-auto'
        } w-full`}
      >
        {sidebarOpen ? (
          <>
            {/* 헤더 */}
            <div className="px-4 pt-3 pb-2 bg-blue-600 text-white shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span className="font-bold text-sm">나만의 맛집 평점 지도</span>
              </div>
              {/* 접기 버튼 */}
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-blue-500 transition-colors"
                title="사이드바 접기"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* 검색바 */}
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

            {/* 리스트 */}
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
          </>
        ) : (
          /* 접힌 상태 — 펼치기 버튼만 표시 */
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-full h-full bg-blue-600 hover:bg-blue-700 text-white flex flex-col items-center justify-center gap-1 transition-colors lg:rounded-xl"
            title="사이드바 열기"
          >
            <ChevronRight className="w-5 h-5" />
            <span className="text-xs font-bold hidden lg:block" style={{ writingMode: 'vertical-rl' }}>
              맛집 목록
            </span>
          </button>
        )}
      </div>

      {/* ── 지도 영역 ── */}
      <div className="flex-1 relative">
        {/* 카테고리 칩 */}
        <div
          className={`absolute top-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 transition-all duration-300 ${
            sidebarOpen ? 'left-0 lg:left-[416px]' : 'left-0 lg:left-16'
          }`}
        >
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
