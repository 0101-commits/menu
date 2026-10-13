import type { Place, RatingsMap } from '../types';
import type { SearchIndexEntry } from './search';
import { searchPlaces } from './search';
import { distanceM, haversine } from './geo';
import { isOpenNow } from './hours';
import { rawOf, summarize, type SourceMeans } from './rating';
import type { SortKey } from './url-state';

export interface RegionFilter {
  sido: string;
  sigungu: string;
  dong: string;
}

export interface PlaceFilters {
  region: RegionFilter;
  categories: string[];
  text: string;
  index: SearchIndexEntry[];
  unvisitedOnly: boolean;
  visitedIds: ReadonlySet<string>;
  openOnly: boolean;
  minScore: number | null;
  ratings: RatingsMap;
  means: SourceMeans;
  now?: Date;
}

export interface PlaceScope {
  places: Place[];
  visiblePlaces: Place[] | null;
  near: { lat: number; lng: number } | null;
  radius: number;
  scope: 'map' | 'all';
}

export interface SortPlacesOptions {
  sort: SortKey;
  origin: { lat: number; lng: number } | null;
  ratings: RatingsMap;
  means: SourceMeans;
}

export type EmptyReason = 'near' | 'filters' | 'map' | 'search' | 'none';

export function ratingsCapabilities(ratings: RatingsMap) {
  const values = Object.values(ratings);
  return {
    hasHours: values.some((rating) => Boolean(rating.hours?.length)),
    hasScores: values.some((rating) =>
      Boolean(rawOf(rating, 'naver') || rawOf(rating, 'kakao') || rawOf(rating, 'google'))),
  };
}

/**
 * 지도 로딩 전의 null과 결과가 진짜 0건인 []를 구분한다.
 * null이면 지도가 아직 답하지 않은 것이므로 전체 목록을 살려 둔다.
 */
export function scopedPlaces({ places, visiblePlaces, near, radius, scope }: PlaceScope): Place[] {
  if (near) return places.filter((place) => distanceM(near.lat, near.lng, place.lat, place.lng) <= radius);
  if (scope === 'all' || visiblePlaces === null) return places;
  return visiblePlaces;
}

export function filterPlaces(input: Place[], filters: PlaceFilters): Place[] {
  const { hasHours, hasScores } = ratingsCapabilities(filters.ratings);
  let list = input;

  if (filters.region.sido) list = list.filter((place) => place.sido === filters.region.sido);
  if (filters.region.sigungu) list = list.filter((place) => place.sigungu === filters.region.sigungu);
  if (filters.region.dong) list = list.filter((place) => place.dong === filters.region.dong);
  if (filters.categories.length) list = list.filter((place) => filters.categories.includes(place.category));

  if (filters.text.trim()) {
    const allowed = new Set(list.map((place) => place.placeId));
    list = searchPlaces(filters.index, filters.text).filter((place) => allowed.has(place.placeId));
  }

  if (filters.unvisitedOnly) list = list.filter((place) => !filters.visitedIds.has(place.placeId));

  // 데이터 전체가 아직 '모름'이면 필터를 적용하지 않는다. 4,084곳 전탈락 회귀 방지.
  if (filters.openOnly && hasHours) {
    const now = filters.now ?? new Date();
    list = list.filter((place) => {
      const rating = filters.ratings[place.placeId];
      return isOpenNow(rating?.hours, now, rating?.hoursDay);
    });
  }

  if (filters.minScore != null && hasScores) {
    list = list.filter((place) => {
      const score = summarize(filters.ratings[place.placeId], filters.means).combined;
      return score != null && score >= filters.minScore!;
    });
  }

  return list;
}

export function sortPlaces(input: Place[], options: SortPlacesOptions): Place[] {
  const sorted = [...input];
  if (options.sort === 'distance' && options.origin) {
    const origin = options.origin;
    sorted.sort((a, b) =>
      haversine(origin.lat, origin.lng, a.lat, a.lng) -
      haversine(origin.lat, origin.lng, b.lat, b.lng));
  } else if (options.sort === 'rating') {
    sorted.sort((a, b) =>
      (summarize(options.ratings[b.placeId], options.means).combined ?? -1) -
      (summarize(options.ratings[a.placeId], options.means).combined ?? -1));
  } else if (options.sort === 'reviews') {
    sorted.sort((a, b) =>
      summarize(options.ratings[b.placeId], options.means).totalReviews -
      summarize(options.ratings[a.placeId], options.means).totalReviews);
  }
  return sorted;
}

export function buildPlaceResults(scope: PlaceScope, filters: PlaceFilters, sort: SortPlacesOptions): Place[] {
  return sortPlaces(filterPlaces(scopedPlaces(scope), filters), sort);
}

export function outsideResultCount(
  allPlaces: Place[],
  visibleResultCount: number,
  filters: PlaceFilters,
  options: { near: boolean; scope: 'map' | 'all' },
): number {
  if (options.near || options.scope === 'all' || !filters.text.trim()) return 0;
  return Math.max(0, filterPlaces(allPlaces, filters).length - visibleResultCount);
}

export function diagnoseEmpty(options: {
  near: boolean;
  activeFilters: boolean;
  mapScope: boolean;
  searchText: boolean;
}): EmptyReason {
  if (options.near) return 'near';
  if (options.activeFilters) return 'filters';
  if (options.mapScope) return 'map';
  if (options.searchText) return 'search';
  return 'none';
}

export function numberedPlaceIds(places: Place[], limit = 20): string[] {
  return places.slice(0, limit).map((place) => place.placeId);
}
