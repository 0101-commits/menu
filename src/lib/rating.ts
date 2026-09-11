// 세 소스의 평점을 다루는 규칙.
//
// 왜 단순 평균이 아닌가: 같은 5점 만점이어도 표본 성격이 다르다.
// 네이버는 영수증·예약 인증이라 표본이 크고 후하게 나오고, 카카오는 표본이 작아
// 극단값 하나가 평균을 끌어내린다(실측: 리뷰 49건에 평균 3.0). 구글은 관광객 비중이 높다.
//
// 그래서 화면에는 항상 원 점수와 리뷰 수를 함께 보여 주고,
// 정렬용 통합 점수만 베이지안 평균으로 보정한다.
//
//   보정점수 = (n·r + m·C) / (n + m)
//     n = 그 소스의 리뷰 수, r = 그 소스의 평점
//     m = 소스별 사전 표본, C = 그 소스의 전체 평균
//
// 표본이 작을수록 전체 평균 쪽으로 당겨져 순위를 흔들지 못한다.

import type { Ratings, RatingsMap } from '../types';

export type SourceKey = 'naver' | 'kakao' | 'google';

/** 소스별 사전 표본. 표본이 작은 소스일수록 작게 잡아야 과하게 당기지 않는다. */
const PRIOR: Record<SourceKey, number> = { naver: 50, kakao: 20, google: 30 };

export interface SourceMeans {
  naver: number;
  kakao: number;
  google: number;
}

const DEFAULT_MEANS: SourceMeans = { naver: 4.3, kakao: 3.9, google: 4.2 };

/** 소스별 원 점수와 표본 수를 꺼낸다. 없으면 undefined. */
export function rawOf(r: Ratings | undefined, key: SourceKey): { score: number; n: number } | undefined {
  if (!r) return undefined;
  if (key === 'naver') {
    const v = r.naver;
    return v && v.score != null ? { score: v.score, n: v.visitors } : undefined;
  }
  if (key === 'kakao') {
    const v = r.kakao;
    return v && v.score != null ? { score: v.score, n: v.count } : undefined;
  }
  const v = r.google;
  return v && v.score != null ? { score: v.score, n: v.count } : undefined;
}

/** 데이터 전체에서 소스별 평균을 구한다. 앱 시작 때 한 번만 부른다. */
export function computeMeans(map: RatingsMap): SourceMeans {
  const acc: Record<SourceKey, { sum: number; n: number }> = {
    naver: { sum: 0, n: 0 },
    kakao: { sum: 0, n: 0 },
    google: { sum: 0, n: 0 },
  };
  for (const r of Object.values(map)) {
    for (const key of ['naver', 'kakao', 'google'] as SourceKey[]) {
      const raw = rawOf(r, key);
      if (raw) {
        acc[key].sum += raw.score;
        acc[key].n += 1;
      }
    }
  }
  const mean = (k: SourceKey) => (acc[k].n > 0 ? acc[k].sum / acc[k].n : DEFAULT_MEANS[k]);
  return { naver: mean('naver'), kakao: mean('kakao'), google: mean('google') };
}

export interface RatingSummary {
  /** 정렬·필터에 쓰는 보정 평균. 점수가 있는 소스가 하나도 없으면 null. */
  combined: number | null;
  /** 소스 2개 이상이고 표본 합이 100 이상이면 high */
  confidence: 'high' | 'low';
  sourceCount: number;
  totalReviews: number;
  /** 원 점수들의 최대-최소. 소스 간 의견이 갈리는지 보여준다. */
  spread: number | null;
  /** 사용자에게 한 줄로 알릴 주의. 없으면 undefined. */
  caution?: string;
}

const EMPTY: RatingSummary = {
  combined: null, confidence: 'low', sourceCount: 0, totalReviews: 0, spread: null,
};

export function summarize(r: Ratings | undefined, means: SourceMeans = DEFAULT_MEANS): RatingSummary {
  if (!r) return EMPTY;

  const adjusted: number[] = [];
  const rawScores: number[] = [];
  let totalReviews = 0;
  let smallSample: SourceKey | null = null;

  for (const key of ['naver', 'kakao', 'google'] as SourceKey[]) {
    const raw = rawOf(r, key);
    if (!raw) continue;
    const m = PRIOR[key];
    adjusted.push((raw.n * raw.score + m * means[key]) / (raw.n + m));
    rawScores.push(raw.score);
    totalReviews += raw.n;
    if (raw.n < 20 && smallSample === null) smallSample = key;
  }

  if (adjusted.length === 0) return EMPTY;

  const combined = adjusted.reduce((s, v) => s + v, 0) / adjusted.length;
  const spread = rawScores.length > 1 ? Math.max(...rawScores) - Math.min(...rawScores) : null;
  const confidence: 'high' | 'low' =
    adjusted.length >= 2 && totalReviews >= 100 ? 'high' : 'low';

  const LABEL: Record<SourceKey, string> = { naver: '네이버', kakao: '카카오', google: '구글' };
  const caution =
    spread !== null && spread >= 0.8
      ? '소스마다 평가가 갈립니다'
      : smallSample
        ? `${LABEL[smallSample]} 표본이 적습니다`
        : undefined;

  return { combined, confidence, sourceCount: adjusted.length, totalReviews, spread, ...(caution ? { caution } : {}) };
}

/** 점수 표기. 소수 한 자리로 맞춰 자릿수가 흔들리지 않게 한다. */
export function formatScore(score: number | null | undefined): string {
  return score == null ? '—' : score.toFixed(1);
}

/** 리뷰 수 표기. 1,117 / 2.9만 */
export function formatCount(n: number | undefined): string {
  if (!n) return '0';
  return n >= 10000 ? `${(n / 10000).toFixed(1)}만` : n.toLocaleString();
}

/** ₩ 개수를 기호로. */
export function formatPrice(level: number | undefined): string | null {
  return level && level >= 1 && level <= 4 ? '₩'.repeat(level) : null;
}
