// 장소·평점·메타데이터를 받아온다.
//
// 예전에는 src/data/places.ts가 1.19MB TS 모듈이라 첫 JS 번들에 통째로 실렸다.
// 정적 JSON으로 내보내고 앱이 시작할 때 받는다. 평점과 메타는 목록 뒤에 합류해도 된다.

import type { DetailsMap, Place, RatingsMap } from '../types';
import type { DataMeta } from './meta';

const base = import.meta.env.BASE_URL;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${base}${path}`, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${path} — HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function loadPlaces(): Promise<Place[]> {
  return getJson<Place[]>('data/places.json');
}

/** 평점은 없어도 목록·지도·검색이 살아 있어야 한다. */
export async function loadRatings(): Promise<RatingsMap> {
  try { return await getJson<RatingsMap>('data/ratings.json'); }
  catch { return {}; }
}

/** 상세 보조 정보(AI 요약·붐비는 시간). 상세를 처음 열 때 받는다. 실패는 부르는 쪽이 다시 시도한다. */
export function loadDetails(): Promise<DetailsMap> {
  return getJson<DetailsMap>('data/details.json');
}

/** 메타는 보조 정보다. 실패를 장소 로딩 실패로 승격하지 않는다. */
export function loadMeta(): Promise<DataMeta> {
  return getJson<DataMeta>('data/meta.json');
}

/**
 * 목록이 "같은 목록"인지 가리는 서명.
 * 지도를 조금만 밀어도 배열은 새 객체가 된다. 참조로 판단하면 목록이 맨 위로 되감긴다.
 */
export function listSignature(places: Pick<Place, 'placeId'>[]): string {
  if (!places.length) return '0';
  return `${places.length}:${places[0].placeId}:${places[places.length - 1].placeId}`;
}
