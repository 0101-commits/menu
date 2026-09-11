// 목록의 한 칸.
//
// 예전 카드에는 이름·주소·세분류와 지도 링크 버튼 셋뿐이었다. 평점을 보려면
// 세 탭을 열어 눈으로 비교해야 했다. 이제 카드 안에서 끝난다.
//
// 카드를 통째로 버튼으로 감싸지 않는다. 안에 외부 링크가 들어가면 버튼 중첩이 된다.
// 제목 영역만 버튼이고 링크·상세는 형제로 둔다.

import { ChevronRight, Check } from 'lucide-react';
import type { Place, Ratings } from '../types';
import { RatingRow } from './RatingRow';
import { colorOf } from '../lib/categories';
import { formatDistance } from '../lib/geo';
import { formatPrice, summarize, type SourceMeans } from '../lib/rating';
import { openStatus } from '../lib/hours';

interface Props {
  place: Place;
  ratings?: Ratings;
  /** km. 중심점이 있을 때만 */
  distanceKm?: number;
  selected: boolean;
  onSelect: (p: Place) => void;
  onDetail: (p: Place) => void;
  means: SourceMeans;
  googleEnabled: boolean;
  ratingsLoading: boolean;
  visited: boolean;
}

const STATE_CLASS: Record<string, string> = {
  open: 'text-[var(--matpin-open)]',
  'closing-soon': 'text-[var(--matpin-closing)]',
  closed: 'text-fg-subtle',
  dayoff: 'text-fg-subtle',
  unknown: 'text-fg-subtle',
};

export function PlaceCard({
  place, ratings, distanceKm, selected, onSelect, onDetail, means, googleEnabled, ratingsLoading, visited,
}: Props) {
  const status = openStatus(ratings?.kakao?.hours);
  const price = formatPrice(ratings?.kakao?.price);
  const sum = summarize(ratings, means);
  const rank = ratings?.kakao?.rank;

  return (
    <li
      className={`rounded-xl border transition-colors ${
        selected ? 'border-primary bg-primary-weak' : 'border-line bg-surface hover:bg-surface-pressed'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(place)}
        aria-pressed={selected}
        className="w-full text-left px-4 pt-3.5 pb-2 rounded-t-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        <span className="flex justify-between items-start gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: colorOf(place.category) }}
            />
            <span className="font-bold text-fg text-[15px] truncate">{place.name}</span>
            {visited && (
              <Check className="w-3.5 h-3.5 shrink-0 text-[var(--matpin-open)]" aria-label="가본 곳" />
            )}
          </span>
          <span className="flex items-center gap-1 shrink-0">
            {distanceKm != null && (
              <span className="text-xs text-fg-subtle tabular-nums">{formatDistance(distanceKm)}</span>
            )}
            <span className="text-xs bg-surface-fill text-fg-muted px-2 py-0.5 rounded-full font-medium">
              {place.category}
            </span>
          </span>
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-fg-muted">
          {place.mcidName && <span>{place.mcidName}</span>}
          <span aria-hidden="true">·</span>
          <span>{place.dong || place.sigungu}</span>
          {price && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{price}</span>
            </>
          )}
          {status.text && (
            <>
              <span aria-hidden="true">·</span>
              <span className={`font-medium ${STATE_CLASS[status.state]}`}>{status.text}</span>
            </>
          )}
        </span>

        {rank && (
          <span className="mt-1.5 inline-block text-[11px] font-medium text-primary-fg bg-primary-weak px-2 py-0.5 rounded-full">
            {rank.text}
            {rank.n ? ` ${rank.n}위` : ''}
          </span>
        )}
      </button>

      <div className="px-4 pb-3 pt-1.5 border-t border-line-subtle mt-1">
        <RatingRow place={place} ratings={ratings} googleEnabled={googleEnabled} loading={ratingsLoading} />

        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-fg-subtle m-0 min-w-0 truncate">
            {sum.combined != null ? (
              <>
                통합 <span className="font-semibold text-fg-muted tabular-nums">{sum.combined.toFixed(1)}</span>
                {sum.caution && <span className="text-[var(--matpin-closing)]"> · {sum.caution}</span>}
              </>
            ) : (
              '평점 없음'
            )}
          </p>
          <button
            type="button"
            onClick={() => onDetail(place)}
            className="shrink-0 flex items-center gap-0.5 text-xs font-medium text-primary-fg min-h-11 -my-3 px-1 rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            자세히
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
