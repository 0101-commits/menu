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

/** 작을수록 앞. 정렬 기준이 없으면 null(입력 순서 유지). */
function sortKeyOf({ sort, origin, ratings, means }: SortPlacesOptions): ((place: Place) => number) | null {
  if (sort === 'distance' && origin) return (place) => haversine(origin.lat, origin.lng, place.lat, place.lng);
  if (sort === 'rating') return (place) => -(summarize(ratings[place.placeId], means).combined ?? -1);
  if (sort === 'reviews') return (place) => -summarize(ratings[place.placeId], means).totalReviews;
  return null;
}

export function sortPlaces(input: Place[], options: SortPlacesOptions): Place[] {
  // 비교 함수 안에서 점수를 구하면 n log n 번(4,084곳이면 약 10만 번) 다시 계산한다.
  // 지도를 멈출 때마다 이걸 돌아 평점순 132ms·리뷰순 172ms(데스크톱, 휴대폰은 4배 안팎)가 걸렸다.
  // 가게마다 한 번만 구해 두고 숫자로 정렬한다. sort 는 안정 정렬이라 같은 값끼리 순서도 그대로다.
  const keyOf = sortKeyOf(options);
  if (!keyOf) return [...input];
  return input
    .map((place) => ({ place, key: keyOf(place) }))
    .sort((a, b) => a.key - b.key)
    .map(({ place }) => place);
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
