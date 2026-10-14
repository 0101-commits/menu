import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Place, RatingsMap } from '../types';
import type { AppState, SortKey } from '../lib/url-state';
import { buildIndex, parseQuery } from '../lib/search';
import { geocodePlace } from '../lib/kakao';
import { type SourceMeans } from '../lib/rating';
import {
  buildPlaceResults,
  diagnoseEmpty,
  filterPlaces,
  numberedPlaceIds,
  outsideResultCount,
  ratingsCapabilities,
  type RegionFilter,
} from '../lib/place-query';

export interface Near {
  label: string;
  lat: number;
  lng: number;
}

export const EMPTY_REGION: RegionFilter = { sido: '', sigungu: '', dong: '' };

interface Options {
  initial: AppState;
  places: Place[];
  ratings: RatingsMap;
  means: SourceMeans;
  visiblePlaces: Place[] | null;
  mapCenter: { lat: number; lng: number } | null;
  selectedPlace: Place | null;
  visitedIds: ReadonlySet<string>;
}

export function useSearchState({
  initial, places, ratings, means, visiblePlaces, mapCenter, selectedPlace, visitedIds,
}: Options) {
  const [query, setQuery] = useState(initial.q ?? initial.near ?? '');
  const [textFilter, setTextFilter] = useState(initial.q ?? '');
  const [categories, setCategories] = useState<string[]>(initial.cat ?? []);
  const [near, setNear] = useState<Near | null>(null);
  const [radius, setRadius] = useState(initial.r ?? 500);
  const [scope, setScope] = useState<'map' | 'all'>(initial.all ? 'all' : 'map');
  const [region, setRegion] = useState<RegionFilter>(EMPTY_REGION);
  const [regionOpen, setRegionOpen] = useState(false);
  const [openOnly, setOpenOnly] = useState(Boolean(initial.open));
  const [minScore, setMinScore] = useState<number | null>(initial.min ?? null);
  const [unvisitedOnly, setUnvisitedOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>(initial.sort ?? 'distance');
  const [geocoding, setGeocoding] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!initial.near) return;
    if (initial.ll) {
      setNear({ label: initial.near, lat: initial.ll.lat, lng: initial.ll.lng });
      return;
    }
    setGeocoding(true);
    void geocodePlace(initial.near)
      .then((hits) => {
        if (hits[0]) setNear({ label: initial.near!, lat: hits[0].lat, lng: hits[0].lng });
        else setSearchNotice(`'${initial.near}' 위치를 찾지 못했습니다.`);
      })
      .finally(() => setGeocoding(false));
  }, [initial]);

  const index = useMemo(() => buildIndex(places), [places]);

  // input 을 주면 그 글로 검색한다(공유로 받은 가게 이름 등). 검색칸에도 같이 넣는다.
  const runSearch = useCallback(async (input?: string) => {
    if (input != null) setQuery(input);
    const parsed = parseQuery(input ?? query);
    if (parsed.categories.length) setCategories((prev) => [...new Set([...prev, ...parsed.categories])]);
    setSearchNotice(null);
    const text = parsed.text.trim();
    if (!text) { setNear(null); setTextFilter(''); setRegion(EMPTY_REGION); return; }

    const looksLikePlace = /(역|공원|대학교|터미널|공항|시장|광장|타워|스퀘어)$/.test(text);
    if (!looksLikePlace && places.some((place) => place.name.includes(text))) {
      setNear(null);
      setTextFilter(text);
      return;
    }

    setGeocoding(true);
    try {
      const hits = await geocodePlace(text);
      if (hits[0]) {
        setNear({ label: text, lat: hits[0].lat, lng: hits[0].lng });
        setTextFilter('');
        setRegion(EMPTY_REGION);
      } else {
        setNear(null);
        setTextFilter(text);
        setSearchNotice(`'${text}' 위치를 찾지 못했습니다. 가게 이름으로 찾아봅니다.`);
      }
    } finally {
      setGeocoding(false);
    }
  }, [query, places]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const parsed = parseQuery(query);
      setTextFilter(near && parsed.text.trim() === near.label ? '' : parsed.text);
    }, 220);
    return () => clearTimeout(timer);
  }, [query, near]);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) { setNear(null); setSearchNotice(null); }
  }, []);

  const origin = useMemo(
    () => near ?? (selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null),
    [near, selectedPlace],
  );
  const distanceOrigin = useMemo(() => origin ?? mapCenter, [origin, mapCenter]);
  const { hasHours, hasScores } = useMemo(() => ratingsCapabilities(ratings), [ratings]);

  const filterOptions = useMemo(() => ({
    region, categories, text: textFilter, index, unvisitedOnly, visitedIds,
    openOnly, minScore, ratings, means,
  }), [region, categories, textFilter, index, unvisitedOnly, visitedIds, openOnly, minScore, ratings, means]);

  const filtered = useMemo(() => buildPlaceResults(
    { places, visiblePlaces, near, radius, scope },
    filterOptions,
    { sort, origin, ratings, means },
  ), [places, visiblePlaces, near, radius, scope, filterOptions, sort, origin, ratings, means]);

  const outsideCount = useMemo(() => outsideResultCount(
    places, filtered.length, filterOptions, { near: Boolean(near), scope },
  ), [places, filtered.length, filterOptions, near, scope]);

  const canSortDistance = Boolean(origin);
  useEffect(() => {
    if (sort === 'distance' && !canSortDistance) setSort('rating');
  }, [sort, canSortDistance]);

  const pickNow = useCallback(() => {
    if (!navigator.geolocation) { setSearchNotice('이 브라우저는 위치 기능을 지원하지 않습니다.'); return; }
    setGeocoding(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setNear({ label: '내 위치', lat: position.coords.latitude, lng: position.coords.longitude });
        setRadius(1000);
        setOpenOnly(hasHours);
        setSort('rating');
        setQuery('');
        setTextFilter('');
        setSearchNotice(null);
        setGeocoding(false);
      },
      () => {
        setSearchNotice('위치를 못 가져왔습니다. 주소창 왼쪽 자물쇠 아이콘 > 위치 > 허용으로 바꾼 뒤 다시 눌러주세요.');
        setGeocoding(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }, [hasHours]);

  const activeFilters = Boolean(
    categories.length || region.sido || region.sigungu || region.dong || openOnly || minScore != null || unvisitedOnly,
  );
  const emptyReason = diagnoseEmpty({
    near: Boolean(near), activeFilters, mapScope: !near && scope === 'map', searchText: Boolean(textFilter.trim()),
  });

  const resetFilters = useCallback(() => {
    setCategories([]);
    setRegion(EMPTY_REGION);
    setRegionOpen(false);
    setOpenOnly(false);
    setMinScore(null);
    setUnvisitedOnly(false);
  }, []);
  const clearNear = useCallback(() => { setNear(null); setQuery(''); setTextFilter(''); }, []);
  const clearSearch = useCallback(() => { setQuery(''); setTextFilter(''); setSearchNotice(null); }, []);
  const widenRadius = useCallback(() => setRadius((value) => value < 500 ? 500 : value < 1000 ? 1000 : 2000), []);

  const available = useMemo(() => [...new Set(places.map((place) => place.category))], [places]);
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const place of filtered) result[place.category] = (result[place.category] ?? 0) + 1;
    return result;
  }, [filtered]);
  const numbered = useMemo(() => numberedPlaceIds(filtered), [filtered]);
  const focus = useMemo(
    () => near ? { lat: near.lat, lng: near.lng, radius, key: Date.now() } : null,
    [near, radius],
  );

  // 전체에서 검색할 때도 같은 필터 기준을 재사용할 수 있게 공개한다.
  const allFiltered = useMemo(() => filterPlaces(places, filterOptions), [places, filterOptions]);

  return {
    query, setQuery, textFilter, categories, setCategories, near, setNear, radius, setRadius,
    scope, setScope, region, setRegion, regionOpen, setRegionOpen, openOnly, setOpenOnly,
    minScore, setMinScore, unvisitedOnly, setUnvisitedOnly, sort, setSort,
    geocoding, searchNotice, setSearchNotice, runSearch, handleQueryChange, pickNow,
    filtered, allFiltered, outsideCount, origin, distanceOrigin, hasHours, hasScores,
    canSortDistance, activeFilters, emptyReason, resetFilters, clearNear, clearSearch, widenRadius,
    available, counts, numbered, focus,
  };
}
