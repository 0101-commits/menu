import { useState, useMemo } from 'react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';
import { MapPin, Search, X } from 'lucide-react';

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('전체');

  // 카테고리 목록
  const categories = useMemo(() => {
    const cats = Array.from(new Set(places.map((p) => p.category))).sort();
    return ['전체', ...cats];
  }, []);

  // 검색 + 카테고리 필터 적용
  const filteredPlaces = useMemo(() => {
    return visiblePlaces.filter((p) => {
      const matchCategory = selectedCategory === '전체' || p.category === selectedCategory;
      const matchSearch =
        searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCategory && matchSearch;
    });
  }, [visiblePlaces, selectedCategory, searchQuery]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col lg:flex-row">

      {/* 사이드바 */}
      <div className="lg:absolute lg:left-4 lg:top-4 lg:bottom-4 lg:w-96 lg:z-10 h-64 lg:h-auto w-full flex flex-col bg-white shadow-xl lg:rounded-xl overflow-hidden">

        {/* 검색바 */}
        <div className="p-3 border-b border-gray-100 bg-white shrink-0">
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
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
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
            onPlaceClick={setSelectedPlace}
            selectedPlaceId={selectedPlace?.id ?? null}
          />
        </div>
      </div>

      {/* 지도 영역 */}
      <div className="flex-1 relative">

        {/* 타이틀 */}
        <div className="absolute top-4 right-4 z-10 bg-white/95 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg border border-gray-200 hidden lg:flex items-center gap-2">
          <MapPin className="w-4 h-4 text-blue-600" />
          <span className="font-semibold text-gray-800 text-sm">나만의 맛집 평점 지도</span>
        </div>

        {/* 카테고리 칩 — 지도 상단 */}
        <div className="absolute top-4 left-[420px] right-48 z-10 hidden lg:block">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium shadow-md transition-all ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white shadow-blue-200'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* 모바일 카테고리 */}
        <div className="absolute bottom-0 left-0 right-0 z-10 lg:hidden bg-white border-t border-gray-200 px-3 py-2">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <MapView
          places={places}
          selectedPlace={selectedPlace}
          onMarkerClick={setSelectedPlace}
          onBoundsChange={setVisiblePlaces}
        />
      </div>
    </div>
  );
}
