// 장소·평점 데이터를 받아온다.
//
// 예전에는 src/data/places.ts 가 1.19MB 짜리 TS 모듈이라 첫 JS 번들에 통째로 실렸다.
// 평점까지 붙으면 더 커진다. 정적 JSON 으로 내보내고 앱이 시작할 때 받는다.
// 평점은 목록이 뜬 뒤에 와도 되므로 따로 받아 늦게 합친다.

import type { Place, RatingsMap } from '../types';

// import.meta.env.BASE_URL 은 GitHub Pages 의 하위 경로(/menu/) 배포를 위해 필요하다.
const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function loadPlaces(): Promise<Place[]> {
  return getJson<Place[]>('data/places.json');
}

/**
 * 평점은 없어도 앱이 돌아가야 한다. 파일이 아직 없거나 실패하면 빈 맵을 준다.
 * (수집이 한 번도 안 돈 상태에서도 목록·지도·검색은 그대로 쓸 수 있어야 한다)
 */
export async function loadRatings(): Promise<RatingsMap> {
  try {
    return await getJson<RatingsMap>('data/ratings.json');
  } catch {
    return {};
  }
}
