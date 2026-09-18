// 지도에서 마커를 고르면 그 위에 뜨는 작은 창.
//
// 카드와 같은 정보를 다 넣지 않는다. 지도 위 공간은 좁고, 자세한 건 시트가 맡는다.
// 여기서는 "이 핀이 무엇이고 평점이 어떤가" 까지만.

import { X, ChevronRight } from 'lucide-react';
import type { Place, Ratings } from '../types';
import { RatingRow } from './RatingRow';
import { colorOf } from '../lib/categories';
import { openStatus } from '../lib/hours';
import { scoreLabel, summarize, type SourceMeans } from '../lib/rating';

interface Props {
  place: Place;
  ratings?: Ratings;
  means: SourceMeans;
  onClose: () => void;
  onDetail: (p: Place) => void;
}

export function PlaceInfoWindow({ place, ratings, means, onClose, onDetail }: Props) {
  const status = openStatus(ratings?.kakao?.hours, undefined, ratings?.kakao?.hoursDay);
  const sum = summarize(ratings, means);

  return (
    // 지도 타일은 카카오 SDK 가 그려서 다크 모드에서도 밝다.
    // 배경은 불투명한 surface 로 고정해야 글자가 읽힌다.
    <div className="bg-surface-raised text-fg rounded-xl shadow-xl border border-line p-3 w-[272px]">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-2 h-2 rounded-full shrink-0" style={{ background: colorOf(place.category) }} />
            <h3 className="font-bold text-base text-fg m-0 truncate">{place.name}</h3>
          </div>
          <p className="m-0 mt-0.5 text-xs text-fg-muted truncate">
            {place.category}
            {place.mcidName && place.mcidName !== place.category ? ` · ${place.mcidName}` : ''}
            {status.text ? ` · ${status.text}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="grid place-items-center w-9 h-9 -mr-1.5 -mt-1.5 shrink-0 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-line-subtle">
        <RatingRow place={place} ratings={ratings} />
      </div>

      <button
        type="button"
        onClick={() => onDetail(place)}
        className="mt-2 w-full flex items-center justify-between gap-1 min-h-11 px-3 rounded-lg bg-surface-fill hover:bg-surface-pressed transition-colors text-sm font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span className="text-xs text-fg-muted tabular-nums">
          {sum.combined != null ? `${scoreLabel(sum)} ${sum.combined.toFixed(1)}` : '평점 없음'}
        </span>
        <span className="flex items-center gap-0.5">
          자세히
          <ChevronRight className="w-4 h-4" aria-hidden="true" />
        </span>
      </button>
    </div>
  );
}
