import type { Place, RatingsMap } from '../types';

export function place(overrides: Partial<Place> = {}): Place {
  const id = overrides.placeId ?? String(overrides.id ?? 1);
  return {
    id: Number(id) || 1,
    name: `가게 ${id}`,
    category: '한식',
    folder: '한식',
    mcidName: '한식',
    placeId: id,
    lat: 37.5,
    lng: 127,
    address: '서울특별시 강남구 역삼동',
    naverUrl: `https://m.place.naver.com/restaurant/${id}`,
    sido: '서울특별시',
    sigungu: '강남구',
    dong: '역삼동',
    ...overrides,
  };
}

export const means = { naver: 4.3, kakao: 3.9, google: 4.2 };

export const ratings: RatingsMap = {
  '1': { naver: { score: 4.8, visitors: 100, blogs: 0 } },
  '2': { kakao: { score: 3.5, count: 20, blogs: 0 } },
  '3': { naver: { score: 4.2, visitors: 500, blogs: 0 } },
};
