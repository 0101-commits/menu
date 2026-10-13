import { describe, expect, it } from 'vitest';
import { buildIndex } from './search';
import {
  buildPlaceResults,
  diagnoseEmpty,
  filterPlaces,
  numberedPlaceIds,
  outsideResultCount,
  ratingsCapabilities,
  scopedPlaces,
  sortPlaces,
  type PlaceFilters,
} from './place-query';
import { means, place, ratings } from '../test/fixtures';

const places = [
  place({ id: 1, placeId: '1', name: '가나다 식당', lat: 37.5, category: '한식' }),
  place({ id: 2, placeId: '2', name: '라마바 카페', lat: 37.51, category: '카페', dong: '삼성동' }),
  place({ id: 3, placeId: '3', name: '사아자 김밥', lat: 37.52, category: '분식' }),
];

function filters(overrides: Partial<PlaceFilters> = {}): PlaceFilters {
  return {
    region: { sido: '', sigungu: '', dong: '' },
    categories: [],
    text: '',
    index: buildIndex(places),
    unvisitedOnly: false,
    visitedIds: new Set(),
    openOnly: false,
    minScore: null,
    ratings,
    means,
    ...overrides,
  };
}

describe('scopedPlaces', () => {
  it('지도 로딩 전 null이면 전체 목록을 유지한다', () => {
    expect(scopedPlaces({ places, visiblePlaces: null, near: null, radius: 500, scope: 'map' })).toEqual(places);
  });

  it('지도가 실제로 빈 배열을 주면 0건을 유지한다', () => {
    expect(scopedPlaces({ places, visiblePlaces: [], near: null, radius: 500, scope: 'map' })).toEqual([]);
  });

  it('중심점이 있으면 반경 안만 고른다', () => {
    expect(scopedPlaces({
      places, visiblePlaces: null, near: { lat: 37.5, lng: 127 }, radius: 1500, scope: 'all',
    }).map((item) => item.placeId)).toEqual(['1', '2']);
  });
});

describe('filterPlaces', () => {
  it('카테고리와 지역을 함께 적용한다', () => {
    expect(filterPlaces(places, filters({
      categories: ['카페'], region: { sido: '서울특별시', sigungu: '강남구', dong: '삼성동' },
    })).map((item) => item.placeId)).toEqual(['2']);
  });

  it('검색 관련도 순서를 보존한다', () => {
    expect(filterPlaces(places, filters({ text: '김밥' })).map((item) => item.placeId)).toEqual(['3']);
  });

  it('안 가본 곳만 남긴다', () => {
    expect(filterPlaces(places, filters({ unvisitedOnly: true, visitedIds: new Set(['1', '3']) }))
      .map((item) => item.placeId)).toEqual(['2']);
  });

  it('평점 데이터가 전부 없으면 최소 평점 필터로 전탈락시키지 않는다', () => {
    expect(filterPlaces(places, filters({ minScore: 4, ratings: {} }))).toHaveLength(3);
  });

  it('영업시간 데이터가 전부 없으면 영업 중 필터로 전탈락시키지 않는다', () => {
    expect(filterPlaces(places, filters({ openOnly: true, ratings: {} }))).toHaveLength(3);
  });

  it('평점 데이터가 있으면 최소 점수를 적용한다', () => {
    expect(filterPlaces(places, filters({ minScore: 4.4 })).map((item) => item.placeId)).toEqual(['1']);
  });
});

describe('sort and derived results', () => {
  it('거리순으로 정렬한다', () => {
    expect(sortPlaces([...places].reverse(), {
      sort: 'distance', origin: { lat: 37.5, lng: 127 }, ratings, means,
    }).map((item) => item.placeId)).toEqual(['1', '2', '3']);
  });

  it('리뷰 많은순으로 정렬한다', () => {
    expect(sortPlaces(places, { sort: 'reviews', origin: null, ratings, means })
      .map((item) => item.placeId)).toEqual(['3', '1', '2']);
  });

  it('범위·필터·정렬을 한 번에 적용한다', () => {
    expect(buildPlaceResults(
      { places, visiblePlaces: places, near: null, radius: 500, scope: 'map' },
      filters({ categories: ['한식', '분식'] }),
      { sort: 'rating', origin: null, ratings, means },
    ).map((item) => item.placeId)).toEqual(['1', '3']);
  });

  it('지도 밖 검색 결과 수를 같은 필터로 센다', () => {
    expect(outsideResultCount(places, 0, filters({ text: '김밥' }), { near: false, scope: 'map' })).toBe(1);
  });

  it('지도 번호는 상위 20개까지만 목록 순서를 따른다', () => {
    const many = Array.from({ length: 25 }, (_, index) => place({ id: index + 1, placeId: String(index + 1) }));
    expect(numberedPlaceIds(many)).toHaveLength(20);
    expect(numberedPlaceIds(many)[19]).toBe('20');
  });
});

describe('capabilities and empty diagnosis', () => {
  it('데이터 보유 기능을 계산한다', () => {
    expect(ratingsCapabilities(ratings)).toEqual({ hasHours: false, hasScores: true });
  });

  it.each([
    [{ near: true, activeFilters: true, mapScope: true, searchText: true }, 'near'],
    [{ near: false, activeFilters: true, mapScope: true, searchText: true }, 'filters'],
    [{ near: false, activeFilters: false, mapScope: true, searchText: true }, 'map'],
    [{ near: false, activeFilters: false, mapScope: false, searchText: true }, 'search'],
    [{ near: false, activeFilters: false, mapScope: false, searchText: false }, 'none'],
  ] as const)('빈 결과 원인을 우선순위로 고른다', (input, reason) => {
    expect(diagnoseEmpty(input)).toBe(reason);
  });
});
