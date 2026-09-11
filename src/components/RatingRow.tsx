// 세 소스의 평점을 한 줄에 나란히 놓는다.
//
// 규칙 세 가지.
//   칸은 항상 세 개. 값이 없어도 자리를 비우지 않는다 — 위치가 흔들리면 눈이 못 읽는다.
//   점수 옆에 표본을 반드시 둔다. 점수만 크게 두면 3.0(49건)이 4.5(1,117건)와 같은 무게로 읽힌다.
//   값이 없는 이유를 구분해 적는다. "미매칭"(연결된 장소가 없음)과 "수집 전"은 다른 상태다.

import type { Place, Ratings } from '../types';
import { BrandDot, type Brand } from './BrandDot';
import { formatCount, formatScore } from '../lib/rating';

interface Cell {
  brand: Brand;
  score: number | null;
  sub: string;
  muted?: boolean;
}

function cellsOf(place: Place | null, r: Ratings | undefined, googleEnabled: boolean): Cell[] {
  const n = r?.naver;
  const k = r?.kakao;
  const g = r?.google;

  return [
    {
      brand: 'naver',
      score: n?.score ?? null,
      // 칸 하나가 좁다(패널 400px ÷ 3). 블로그 수까지 넣으면 잘린다 — 그건 상세에서 본다.
      sub: n ? `방문 ${formatCount(n.visitors)}` : '수집 전',
      muted: !n,
    },
    {
      brand: 'kakao',
      score: k?.score ?? null,
      sub: k
        ? `별점 ${formatCount(k.count)}`
        : place && !place.kakaoId
          ? '미매칭'
          : '수집 전',
      muted: !k,
    },
    {
      brand: 'google',
      score: g?.score ?? null,
      sub: g
        ? `리뷰 ${formatCount(g.count)}`
        : !googleEnabled
          ? '미사용'
          : place && !place.googlePlaceId
            ? '미매칭'
            : '수집 전',
      muted: !g,
    },
  ];
}

interface Props {
  place?: Place | null;
  ratings?: Ratings;
  googleEnabled?: boolean;
  /** 평점을 아직 받아오는 중 */
  loading?: boolean;
}

export function RatingRow({ place = null, ratings, googleEnabled = false, loading = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {(['naver', 'kakao', 'google'] as Brand[]).map((b) => (
          <div key={b} className="flex items-center gap-1.5">
            <BrandDot brand={b} size={16} />
            <span className="h-3 w-10 rounded bg-surface-fill animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const cells = cellsOf(place, ratings, googleEnabled);

  return (
    <ul className="grid grid-cols-3 gap-2 m-0 p-0 list-none">
      {cells.map((c) => (
        <li key={c.brand} className="flex items-center gap-1.5 min-w-0">
          <BrandDot brand={c.brand} size={16} />
          <span className="min-w-0">
            <span
              className={`block text-[13px] font-semibold leading-tight tabular-nums ${
                c.score == null ? 'text-fg-subtle' : 'text-fg'
              }`}
            >
              {formatScore(c.score)}
            </span>
            <span className="block text-[10.5px] text-fg-subtle truncate tabular-nums">{c.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
