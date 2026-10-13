// 온디맨드 평점 조회(Cloudflare Worker).
//
// 구글 목록 값은 Worker KV의 영구 시드를 읽는다. 값에는 수집 시각 at이 있고,
// 30일보다 낡은 값을 본 순간 Worker가 응답 뒤 일부를 갱신한다. 공개 JSON에는 넣지 않는다.
// 발견한 미저장 가게는 대상이 무한하고 브라우저가 네이버·카카오를 직접 부를 수 없어서
// 상세 조회도 Worker를 통한다. Worker 주소가 없으면 이 두 기능만 조용히 꺼진다.

import type { GoogleRating, Ratings } from '../types';

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

/**
 * 실패하면 거부한다. 빈 객체로 삼키면 "평점이 없는 가게" 와 "못 받아온 가게" 가
 * 화면에서 똑같아 보이고, 사용자는 다시 시도할 방법도 실패했다는 사실도 모른다.
 *
 * 실패한 응답은 캐시에 남기지 않는다 — 일시적인 네트워크 오류를 세션 내내 붙들면 안 된다.
 */
export function fetchRatings(q: RatingQuery): Promise<Ratings> {
  if (!RATINGS_API) return Promise.reject(new Error('NO_RATINGS_API'));
  const key = cacheKey(q);
  const hit = cache.get(key);
  if (hit) return hit;

  const url = new URL(RATINGS_API);
  if (q.n) url.searchParams.set('n', q.n);
  if (q.k) url.searchParams.set('k', q.k);
  if (q.g) url.searchParams.set('g', q.g);

  const p = fetch(url, { signal: AbortSignal.timeout(12000) })
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<Ratings>;
    })
    .catch((e) => {
      cache.delete(key); // 다음에 다시 눌러 보면 새로 받는다
      throw e;
    });

  cache.set(key, p);
  return p;
}

/** 한 요청에 물을 수 있는 구글 place ID 수. 워커의 상한과 같아야 한다. */
const IDS_MAX = 60;

/**
 * 목록에 지금 그려진 가게들의 구글 평점을 한 번에 받는다. 키는 **구글** place ID 다.
 *
 * 워커는 네이버↔구글 매핑을 모른다. 그 변환은 앱이 places.json 으로 이미 할 수 있으므로
 * 여기서는 구글 ID 를 그대로 주고받는다.
 *
 * 이 경로는 구글 API 를 절대 부르지 않는다 — KV 에 이미 있는 것만 온다(요금 0).
 * 실패하면 빈 객체를 준다. 구글 칸은 없어도 되는 정보라 앱을 멈출 이유가 없다.
 */
export async function fetchGoogleByIds(gids: string[]): Promise<Record<string, GoogleRating>> {
  if (!RATINGS_API || !GOOGLE_ENABLED || !gids.length) return {};
  const base = RATINGS_API.endsWith('/') ? RATINGS_API : `${RATINGS_API}/`;
  const out: Record<string, GoogleRating> = {};

  for (let i = 0; i < gids.length; i += IDS_MAX) {
    const url = new URL('google', base);
    url.searchParams.set('ids', gids.slice(i, i + IDS_MAX).join(','));
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      Object.assign(out, (await res.json()) as Record<string, GoogleRating>);
    } catch {
      // 한 묶음이 실패해도 나머지는 받는다. 칸은 "수집 전" 으로 남고 다음 조회에 다시 시도된다.
    }
  }
  return out;
}

export interface WorkerHealth {
  ok: boolean;
  google: boolean;
  routes: string[];
  builtAt: string;
  commit: string;
}

/** Worker 배포본 상태. 키 값이나 평점 데이터는 받지 않는다. */
export async function fetchWorkerHealth(): Promise<WorkerHealth> {
  if (!RATINGS_API) throw new Error('NO_RATINGS_API');
  const base = RATINGS_API.endsWith('/') ? RATINGS_API : `${RATINGS_API}/`;
  const response = await fetch(new URL('health', base), {
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<WorkerHealth>;
}
