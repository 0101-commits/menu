import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Chip, Switch, TextField } from '@seed-design/react';
import { MapPin, Search, X, ChevronDown, Moon, Sun } from 'lucide-react';
import { MapView } from './components/MapView';
import { PlaceList } from './components/PlaceList';
import { places, Place } from './data/places';

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

type ColorScheme = 'light' | 'dark';

function readColorScheme(): ColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-seed-user-color-scheme') === 'dark' ? 'dark' : 'light';
}

export default function App() {
  const [selectedPlace, setSelectedPlace] = useState<Place | null>(null);
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>(places);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [centerOn, setCenterOn] = useState<{ lat: number; lng: number; level: number } | null>(null);
  const [regionFilteredPlaces, setRegionFilteredPlaces] = useState<Place[] | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [globalSearch, setGlobalSearch] = useState(false);
  const [colorScheme, setColorScheme] = useState<ColorScheme>(readColorScheme);
  const resetRegionRef = useRef<(() => void) | null>(null);

  // 칩 바 높이는 칩 크기와 줄바꿈에 따라 달라진다. 상수로 박아두면 지도 상단이 가려진다.
  const chipBarRef = useRef<HTMLDivElement>(null);
  const [chipBarHeight, setChipBarHeight] = useState(48);
  useEffect(() => {
    const el = chipBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setChipBarHeight(entry.contentRect.height));
    ro.observe(el);
    setChipBarHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

  const toggleColorScheme = () => {
    const next: ColorScheme = colorScheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-seed-user-color-scheme', next);
    try { localStorage.setItem('matpin-color-scheme', next); } catch { /* 프라이빗 모드 */ }
    setColorScheme(next);
  };

  const categories = useMemo(() =>
    Array.from(new Set(places.map((p) => p.category))).sort(), []);

  const allSelected = selectedCategories.length === 0;

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
    const searchList = (globalSearch && searchQuery.trim()) ? places : (selectedPlace ? places : baseList);

    return searchList
      .map((p) => ({
        ...p,
        dist: selectedPlace ? haversine(selectedPlace.lat, selectedPlace.lng, p.lat, p.lng) : 0,
      }))
      .filter((p) => {
        const matchCat = selectedCategories.length === 0 || selectedCategories.includes(p.category);
        const matchSearch = searchQuery.trim() === '' ||
          p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.address.toLowerCase().includes(searchQuery.toLowerCase());
        return matchCat && matchSearch;
      })
      .sort((a, b) => selectedPlace ? a.dist - b.dist : 0)
      .map(({ dist: _dist, ...p }) => p as Place);
  }, [baseList, selectedCategories, searchQuery, selectedPlace, globalSearch]);

  return (
    <div className="h-screen w-screen overflow-hidden relative bg-surface-sunken text-fg">

      {/* 지도.
          isolate 로 쌓임 맥락을 만들어 MapView 내부의 로딩·에러 오버레이가
          사이드바와 칩 바 위로 올라오지 못하게 막는다.
          이게 없으면 지도 로딩 실패 시 화면 전체가 덮여 목록도 못 쓴다. */}
      <div className="absolute inset-0 isolate">
        <MapView
          places={places}
          selectedPlace={selectedPlace}
          selectedCategories={selectedCategories}
          onMarkerClick={handlePlaceClick}
          onBoundsChange={(vp) => { if (!regionFilteredPlaces) setVisiblePlaces(vp); }}
          centerOn={centerOn}
          categoryBarHeight={chipBarHeight}
        />
      </div>

      {/* 카테고리 칩 */}
      <div
        ref={chipBarRef}
        className={`absolute top-0 right-0 z-20 bg-surface/95 backdrop-blur-sm border-b border-line-subtle transition-all duration-300 ${
          sidebarOpen ? 'left-0 lg:left-[416px]' : 'left-0'
        }`}
      >
        <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide" role="group" aria-label="음식 종류 필터">
          {/* 선택 상태는 SEED 가 data-checked 로 표현한다(중립 반전 필).
              variant 를 갈아끼우는 것보다 시스템의 대비 보장을 그대로 쓰는 편이 안전하다. */}
          <Chip.Root
            size="large"
            variant="solid"
            data-checked={allSelected || undefined}
            aria-pressed={allSelected}
            onClick={() => setSelectedCategories([])}
            className="shrink-0"
          >
            <Chip.Label data-checked={allSelected || undefined}>전체</Chip.Label>
          </Chip.Root>
          {categories.map((cat) => {
            const on = selectedCategories.includes(cat);
            return (
              <Chip.Root
                key={cat}
                size="large"
                variant="solid"
                data-checked={on || undefined}
                aria-pressed={on}
                onClick={() => toggleCategory(cat)}
                className="shrink-0"
              >
                <Chip.Label data-checked={on || undefined}>{cat}</Chip.Label>
              </Chip.Root>
            );
          })}
        </div>
      </div>

      {/* 사이드바 */}
      {sidebarOpen && (
        <div className="absolute left-0 top-0 bottom-0 lg:left-4 lg:top-4 lg:bottom-4 lg:z-20 lg:w-96 w-80 flex flex-col bg-surface shadow-2xl lg:rounded-xl overflow-hidden z-20">
          <div className="px-4 py-3 bg-primary text-on-primary shrink-0 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="font-bold text-base">맛핀</span>
              <span className="text-sm opacity-80 truncate">{filteredPlaces.length.toLocaleString()}곳</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleColorScheme}
                aria-label={colorScheme === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기'}
                className="grid place-items-center w-11 h-11 rounded-lg hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current transition-colors"
              >
                {colorScheme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                aria-label="목록 닫기"
                className="grid place-items-center w-11 h-11 rounded-lg hover:bg-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* 검색 */}
          <div className="p-3 border-b border-line-subtle shrink-0 flex flex-col gap-2">
            {/* 아이콘은 TextField 의 PrefixIcon 슬롯에 넣는다.
                절대배치로 얹으면 입력 텍스트와 겹쳐 글자가 가려진다. */}
            <TextField.Root size="medium" className="w-full">
              <TextField.PrefixIcon svg={<Search aria-hidden="true" />} />
              <TextField.Input
                id="place-search"
                type="search"
                placeholder={globalSearch ? '전체 맛집에서 검색' : '지도 범위에서 검색'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="맛집 검색"
              />
            </TextField.Root>

            <Switch.Root
              checked={globalSearch}
              onCheckedChange={setGlobalSearch}
              className="flex items-center justify-between gap-2 py-1"
            >
              <Switch.Label className="text-sm text-fg-muted">
                전체 맛집에서 검색 · {places.length.toLocaleString()}곳
              </Switch.Label>
              <Switch.Control>
                <Switch.Thumb />
              </Switch.Control>
              <Switch.HiddenInput />
            </Switch.Root>
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
        </div>
      )}

      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="absolute left-4 top-16 z-20 flex items-center gap-2 bg-primary hover:bg-primary-pressed text-on-primary px-4 py-3 rounded-xl shadow-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <MapPin className="w-4 h-4" aria-hidden="true" />
          <span className="font-bold text-sm">맛집 목록</span>
          <ChevronDown className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
