// 목록·지도에서 쓰는 평점 줄.
//
// 규칙 세 가지.
//   칸 수는 화면 전체에서 같다. 카드마다 달라지면 눈이 위치를 못 잡는다.
//   점수 옆에 표본을 반드시 둔다. 점수만 크게 두면 3.0(49건)이 4.5(1,117건)와 같은 무게로 읽힌다.
//   값이 없는 이유를 구분해 적는다. "미매칭"(연결된 장소가 없음)·"별점 없음"·"수집 전"은 다른 상태다.
//
// 구글 칸은 데이터가 실제로 왔을 때만 세운다. 구글 평점은 공개 데이터에 못 넣어서(약관)
// Worker 가 미리 채운 것을 한 번에 받아 오는데, 아직 안 채웠으면 그 칸은 영원히 비어 있다.
// 늘 비는 칸을 세워 두면 카드 가로의 1/3 이 빈칸이 된다 — 실측으로 목록 40장 전부가 그랬다.

import type { Place, Ratings } from '../types';
import { BrandDot, type Brand } from './BrandDot';
import { formatCount, formatScore } from '../lib/rating';

interface Cell {
  brand: Brand;
  score: number | null;
  sub: string;
}

function cellsOf(place: Place | null, r: Ratings | undefined, showGoogle: boolean): Cell[] {
  const n = r?.naver;
  const k = r?.kakao;
  const g = r?.google;

  const cells: Cell[] = [
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

  if (showGoogle) {
    cells.push({
      brand: 'google',
      score: g?.score ?? null,
      sub: g
        ? g.count > 0
          ? `리뷰 ${formatCount(g.count)}`
          : '리뷰 없음'
        : place && !place.googlePlaceId
          ? '미매칭'
          : '수집 전',
    });
  }

  return cells;
}

interface Props {
  place?: Place | null;
  ratings?: Ratings;
  /** 구글 칸을 세울지. 목록용 구글 데이터가 실제로 왔을 때만 true 다. */
  showGoogle?: boolean;
  /** 평점을 아직 받아오는 중 */
  loading?: boolean;
}

export function RatingRow({ place = null, ratings, showGoogle = false, loading = false }: Props) {
  const cols = showGoogle ? 'grid-cols-3' : 'grid-cols-2';

  if (loading) {
    const skeleton: Brand[] = showGoogle ? ['naver', 'kakao', 'google'] : ['naver', 'kakao'];
    return (
      <div className={`grid ${cols} gap-2`} aria-hidden="true">
        {skeleton.map((b) => (
          <div key={b} className="flex items-center gap-1.5">
            <BrandDot brand={b} size={16} />
            <span className="h-3 w-10 rounded bg-surface-fill animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const cells = cellsOf(place, ratings, showGoogle);

  return (
    <ul className={`grid ${cols} gap-2 m-0 p-0 list-none`}>
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
