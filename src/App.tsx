import { useState, useMemo, useCallback, useRef } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin, Search, X, ChevronUp, ChevronDown } from 'lucide-react';

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number; level: number } | null>(null);
  const [regionFilteredPlaces, setRegionFilteredPlaces] = useState<Place[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const resetRegionRef = useRef<(() => void) | null>(null);

  const categories = useMemo(() =>
    Array.from(new Set(places.map((p) => p.category))).sort(), []);

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);

  const handlePlaceClick = useCallback((place: Place | null) => {
    setSelectedPlace(place);
    if (place) {
      setRegionFilteredPlaces(null);
      resetRegionRef.current?.();
      setSidebarOpen(true);
    }
  }, []);

  const handleRegionChange = useCallback((filtered: Place[], lat: number | null, lng: number | null) => {
    if (lat !== null && lng !== null) {
      setCenterOn({ lat, lng, level: 7 });
      setRegionFilteredPlaces(filtered);
    } else {
      setRegionFilteredPlaces(null);
    }
  }, []);

  const baseList = regionFilteredPlaces ?? visiblePlaces;

  const filteredPlaces = useMemo(() => {
    // 가게 클릭 시 → 해당 가게 + 거리순 주변 가게
    if (selectedPlace) {
      const withDist = places
        .map((p) => ({
          ...p,
          dist: haversine(selectedPlace.lat, selectedPlace.lng, p.lat, p.lng),
        }))
        .filter((p) => {
          const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
          const matchSearch = searchQuery.trim() === '' ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.address.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        })
        .sort((a, b) => a.dist - b.dist);

      return withDist.map(({ dist: _dist, ...p }) => p as Place);
    }

    // 기본: 지역/지도 범위 필터
    return baseList.filter((p) => {
      const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
      const matchSearch = searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [baseList, selectedCategories, searchQuery, selectedPlace]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">

      {/* ── 사이드바 (위로 접힘) ── */}
      <div className={`lg:absolute lg:left-4 lg:top-4 lg:z-10 lg:w-96 w-full flex flex-col bg-white shadow-xl lg:rounded-xl overflow-hidden transition-all duration-300 ${
        sidebarOpen ? 'lg:bottom-4 h-64 lg:h-auto' : 'h-12 lg:h-12'
      }`}>

        {/* 헤더 (항상 표시) */}
        <div
          className="px-4 py-3 bg-blue-600 text-white shrink-0 flex items-center justify-between cursor-pointer select-none"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span className="font-bold text-sm">나만의 맛집 평점 지도</span>
            <span className="text-blue-200 text-xs">({filteredPlaces.length}개)</span>
          </div>
          {sidebarOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>

        {/* 내용 — 접히면 숨김 */}
        {sidebarOpen && (
          <>
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
                selectedPlace={selectedPlace}
                onRegionChange={handleRegionChange}
                onResetRegionRef={resetRegionRef}
              />
            </div>
          </>
        )}
      </div>

      {/* ── 지도 영역 ── */}
      <div className="flex-1 relative">
        {/* 카테고리 칩 */}
        <div className={`absolute top-0 right-0 z-10 bg-white/95 backdrop-blur-sm border-b border-gray-200 transition-all duration-300 ${
          sidebarOpen ? 'left-0 lg:left-[416px]' : 'left-0'
        }`}>
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
          selectedCategories={selectedCategories}
          onMarkerClick={handlePlaceClick}
          onBoundsChange={(vp) => { if (!regionFilteredPlaces) setVisiblePlaces(vp); }}
          centerOn={centerOn}
        />
      </div>
    </div>
  );
}
