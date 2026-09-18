// 목록·지도에서 쓰는 평점 줄. 네이버와 카카오 두 칸이다.
//
// 규칙 세 가지.
//   칸 수는 고정이다. 값이 없어도 자리를 비우지 않는다 — 위치가 흔들리면 눈이 못 읽는다.
//   점수 옆에 표본을 반드시 둔다. 점수만 크게 두면 3.0(49건)이 4.5(1,117건)와 같은 무게로 읽힌다.
//   값이 없는 이유를 구분해 적는다. "미매칭"(연결된 장소가 없음)·"별점 없음"·"수집 전"은 다른 상태다.
//
// 구글은 여기 없다. 구글 평점은 무료 한도 때문에 상세를 열 때만 받아오므로 목록에서는
// 언제나 비어 있었다 — 세 칸 중 한 칸이 늘 "수집 전" 이면 그건 정보가 아니라 자리만 먹는다.
// 세 소스 비교는 PlaceSheet 가 맡는다.

import type { Place, Ratings } from '../types';
import { BrandDot, type Brand } from './BrandDot';
import { formatCount, formatScore } from '../lib/rating';

const SHOWN: Brand[] = ['naver', 'kakao'];

interface Cell {
  brand: Brand;
  score: number | null;
  sub: string;
}

function cellsOf(place: Place | null, r: Ratings | undefined): Cell[] {
  const n = r?.naver;
  const k = r?.kakao;

  return [
    {
      brand: 'naver',
      score: n?.score ?? null,
      // 칸이 넓지 않다. 블로그 수까지 넣으면 잘린다 — 그건 상세에서 본다.
      sub: n ? `방문 ${formatCount(n.visitors)}` : '수집 전',
    },
    {
      brand: 'kakao',
      score: k?.score ?? null,
      // 연결은 됐는데 별점이 안 달린 가게가 있다. 그건 "수집 전" 이 아니라 "없음" 이다.
      sub: k
        ? k.count > 0
          ? `별점 ${formatCount(k.count)}`
          : '별점 없음'
        : place && !place.kakaoId
          ? '미매칭'
          : '수집 전',
    },
  ];
}

interface Props {
  place?: Place | null;
  ratings?: Ratings;
  /** 평점을 아직 받아오는 중 */
  loading?: boolean;
}

export function RatingRow({ place = null, ratings, loading = false }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        {SHOWN.map((b) => (
          <div key={b} className="flex items-center gap-1.5">
            <BrandDot brand={b} size={16} />
            <span className="h-3 w-10 rounded bg-surface-fill animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const cells = cellsOf(place, ratings);

  return (
    <ul className="grid grid-cols-2 gap-2 m-0 p-0 list-none">
      {cells.map((c) => (
        <li key={c.brand} className="flex items-center gap-1.5 min-w-0">
          <BrandDot brand={c.brand} size={16} />
          <span className="min-w-0">
            <span
              className={`block text-sm font-semibold leading-tight tabular-nums ${
                c.score == null ? 'text-fg-subtle' : 'text-fg'
              }`}
            >
              {formatScore(c.score)}
            </span>
            <span className="block text-xs text-fg-subtle truncate tabular-nums">{c.sub}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
