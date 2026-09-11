// 온디맨드 평점 조회 (Cloudflare Worker).
//
// 두 가지는 빌드 타임에 미리 채울 수 없다.
//   구글  정책상 rating 등을 30 일 넘게 저장할 수 없다. 4,000 곳을 매달 전량 갱신하면
//         무료 한도(월 1,000 건)를 훨씬 넘는다. 실제로 열어 본 곳만 받아 30 일 캐시한다.
//   발견  저장 안 한 가게는 대상이 무한하다.
//
// 또 하나, 브라우저에서 네이버·카카오 플레이스를 직접 부를 수 없다(CORS). Worker 가 그 통로다.
//
// Worker 주소가 없으면 이 기능만 조용히 꺼진다. 앱의 나머지는 그대로 돈다.

import type { Ratings } from '../types';

export const RATINGS_API: string | undefined = import.meta.env.VITE_RATINGS_API || undefined;

/** 구글 칸을 켤지. Worker 가 있고 명시적으로 켠 경우에만. */
export const GOOGLE_ENABLED: boolean =
  import.meta.env.VITE_GOOGLE_RATINGS === '1' && Boolean(RATINGS_API);

export interface RatingQuery {
  /** 네이버 place ID */
  n?: string;
  /** 카카오 place ID */
  k?: string;
  /** 구글 place ID */
  g?: string;
}

const cache = new Map<string, Promise<Ratings>>();

export function cacheKey(q: RatingQuery): string {
  return `n:${q.n ?? ''}|k:${q.k ?? ''}|g:${q.g ?? ''}`;
}

/** 실패하면 빈 객체. 평점이 없다고 화면이 멈추면 안 된다. */
export function fetchRatings(q: RatingQuery): Promise<Ratings> {
  if (!RATINGS_API) return Promise.resolve({});
  const key = cacheKey(q);
  const hit = cache.get(key);
  if (hit) return hit;

  const url = new URL(RATINGS_API);
  if (q.n) url.searchParams.set('n', q.n);
  if (q.k) url.searchParams.set('k', q.k);
  if (q.g) url.searchParams.set('g', q.g);

  const p = fetch(url, { signal: AbortSignal.timeout(12000) })
    .then((r) => (r.ok ? (r.json() as Promise<Ratings>) : {}))
    .catch(() => ({}) as Ratings);

  cache.set(key, p);
  return p;
}
