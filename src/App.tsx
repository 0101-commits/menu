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

interface MapSearchResult {
  id: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
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

  // 지도 클릭 검색 결과
  const [mapSearchResults, setMapSearchResults] = useState<MapSearchResult[] | null>(null);
  const [mapSearching, setMapSearching] = useState(false);
  const searchTimerRef = useRef<any>(null);

  const categories = useMemo(() =>
    Array.from(new Set(places.map((p) => p.category))).sort(), []);

  const toggleCategory = (cat: string) =>
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]);

  const handlePlaceClick = useCallback((place: Place | null) => {
    setSelectedPlace(place);
    setMapSearchResults(null); // 가게 선택 시 검색 결과 닫기
    if (place) {
      setRegionFilteredPlaces(null);
      resetRegionRef.current?.();
      setSidebarOpen(true);
    }
  }, []);

  // 지도 빈 곳 클릭 → 카카오 Places 검색
  const handleMapAreaClick = useCallback((lat: number, lng: number) => {
    if (!window.kakao?.maps?.services?.Places) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setMapSearching(true);
    setMapSearchResults(null);
    setSidebarOpen(true);

    searchTimerRef.current = setTimeout(() => {
      const ps = new window.kakao.maps.services.Places();
      const location = new window.kakao.maps.LatLng(lat, lng);
      const results: MapSearchResult[] = [];

      ps.categorySearch('FD6', (r: any[], st: string) => {
        if (st === window.kakao.maps.services.Status.OK) {
          r.forEach((d) => results.push({
            id: d.id, name: d.place_name,
            address: d.road_address_name || d.address_name,
            category: d.category_name?.split('>').pop()?.trim() || '',
            lat: parseFloat(d.y), lng: parseFloat(d.x),
          }));
        }
        // 카페도 추가 검색
        ps.categorySearch('CE7', (r2: any[], st2: string) => {
          if (st2 === window.kakao.maps.services.Status.OK) {
            r2.forEach((d) => results.push({
              id: d.id, name: d.place_name,
              address: d.road_address_name || d.address_name,
              category: d.category_name?.split('>').pop()?.trim() || '',
              lat: parseFloat(d.y), lng: parseFloat(d.x),
            }));
          }
          // 거리순 정렬
          results.sort((a, b) =>
            haversine(lat, lng, a.lat, a.lng) - haversine(lat, lng, b.lat, b.lng)
          );
          setMapSearchResults(results.length > 0 ? results : []);
          setMapSearching(false);
        }, { location, radius: 500, size: 10 });
      }, { location, radius: 500, size: 10 });
    }, 300);
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
    if (selectedPlace) {
      return places
        .map((p) => ({ ...p, dist: haversine(selectedPlace.lat, selectedPlace.lng, p.lat, p.lng) }))
        .filter((p) => {
          const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
          const matchSearch = searchQuery.trim() === '' ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            p.address.toLowerCase().includes(searchQuery.toLowerCase());
          return matchCat && matchSearch;
        })
        .sort((a, b) => a.dist - b.dist)
        .map(({ dist: _dist, ...p }) => p as Place);
    }
    return baseList.filter((p) => {
      const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
      const matchSearch = searchQuery.trim() === '' ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [baseList, selectedCategories, searchQuery, selectedPlace]);

  // 지도 클릭 검색 결과 사이드바
  const renderMapSearchSidebar = () => (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-3 py-2.5 border-b border-gray-100 shrink-0 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">📍 주변 가게 검색 결과</span>
        <button onClick={() => setMapSearchResults(null)}
          className="text-xs text-gray-400 hover:text-gray-600">닫기</button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {mapSearching ? (
          <div className="flex items-center gap-2 text-gray-500 text-sm p-4">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 shrink-0"></div>
            주변 가게 검색 중...
          </div>
        ) : mapSearchResults && mapSearchResults.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-8">주변에 등록된 가게가 없습니다</div>
        ) : mapSearchResults ? mapSearchResults.map((r) => (
          <div key={r.id} className="p-4 rounded-xl border border-gray-200 hover:border-blue-300 hover:bg-gray-50 transition-all">
            <div className="flex justify-between items-start mb-1.5">
              <h3 className="font-bold text-gray-900 text-base">{r.name}</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium shrink-0 ml-2">{r.category}</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{r.address}</p>
            <div className="flex gap-2">
              <a href={`https://map.naver.com/v5/search/${encodeURIComponent(r.name)}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-green-50 hover:bg-green-100 transition-colors px-3 py-2 rounded-lg flex-1">
                <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xs">N</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">네이버</span>
              </a>
              <a href={`https://place.map.kakao.com/${r.id}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-yellow-50 hover:bg-yellow-100 transition-colors px-3 py-2 rounded-lg flex-1">
                <div className="w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                  <span className="text-gray-900 font-bold text-xs">K</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">카카오</span>
              </a>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${r.lat},${r.lng},17z`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 bg-blue-50 hover:bg-blue-100 transition-colors px-3 py-2 rounded-lg flex-1">
                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-xs">G</span>
                </div>
                <span className="text-xs font-semibold text-gray-700">구글</span>
              </a>
            </div>
          </div>
        )) : null}
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden relative">
      <div className="absolute inset-0">
        <MapView
          places={places}
          selectedPlace={selectedPlace}
          selectedCategories={selectedCategories}
          onMarkerClick={handlePlaceClick}
          onMapAreaClick={handleMapAreaClick}
          onBoundsChange={(vp) => { if (!regionFilteredPlaces) setVisiblePlaces(vp); }}
          centerOn={centerOn}
          categoryBarHeight={40}
        />
      </div>

      {/* 카테고리 칩 */}
      <div className={`absolute top-0 right-0 z-20 bg-white/95 backdrop-blur-sm border-b border-gray-200 transition-all duration-300 ${sidebarOpen ? 'left-0 lg:left-[416px]' : 'left-0'}`}>
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide">
          <button onClick={() => setSelectedCategories([])}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${selectedCategories.length === 0 ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
            전체
          </button>
          {categories.map((cat) => (
            <button key={cat} onClick={() => toggleCategory(cat)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${selectedCategories.includes(cat) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
              {cat}{selectedCategories.includes(cat) && ' ✓'}
            </button>
          ))}
        </div>
      </div>

      {/* 사이드바 */}
      {sidebarOpen && (
        <div className="absolute left-0 top-0 bottom-0 lg:left-4 lg:top-4 lg:bottom-4 lg:z-20 lg:w-96 w-80 flex flex-col bg-white shadow-2xl lg:rounded-xl overflow-hidden z-20">
          <div className="px-4 py-3 bg-blue-600 text-white shrink-0 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              <span className="font-bold text-sm">나만의 맛집 평점 지도</span>
              <span className="text-blue-200 text-xs">
                ({mapSearchResults ? mapSearchResults.length : filteredPlaces.length}개)
              </span>
            </div>
            <button onClick={() => setSidebarOpen(false)}
              className="p-1 rounded-lg hover:bg-blue-500 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 검색 결과 모드 or 일반 리스트 모드 */}
          {(mapSearchResults !== null || mapSearching) ? renderMapSearchSidebar() : (
            <>
              <div className="p-3 border-b border-gray-100 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" placeholder="식당 이름, 주소 검색" value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-400 focus:bg-white transition-colors" />
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
      )}

      {!sidebarOpen && (
        <button onClick={() => setSidebarOpen(true)}
          className="absolute left-4 top-12 z-20 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl shadow-lg transition-colors">
          <MapPin className="w-4 h-4" />
          <span className="font-bold text-sm">맛집 목록</span>
          <ChevronDown className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
