// 발견 모드에서 찾은 "저장 안 한 가게" 를 눌렀을 때 뜨는 창.
//
// 저장된 가게와 생김새를 일부러 다르게 둔다. 테두리를 점선으로 하고 "저장 안 함" 을 붙인다.
// 같은 카드처럼 보이면 내 목록에 있는 줄로 착각한다.
//
// 평점은 여기서 온디맨드로 받는다. 4,000 곳을 미리 채우는 것과 달리 대상이 무한하므로
// 빌드 타임에 준비할 수 없다. Worker 가 없으면 링크만 보인다.

import { X, ExternalLink, Bookmark, RotateCw } from 'lucide-react';
import type { Discovered, Ratings } from '../types';
import { RatingRow } from './RatingRow';

interface Props {
  item: Discovered;
  ratings?: Ratings;
  loading: boolean;
  /** Worker 가 설정되지 않아 평점을 받을 수 없는 상태 */
  unavailable?: boolean;
  /** 조회했지만 실패했다. "평점 없음" 과 구분해서 보여야 한다. */
  failed?: boolean;
  onRetry: () => void;
  onClose: () => void;
}

export function DiscoveredWindow({ item, ratings, loading, unavailable, failed, onRetry, onClose }: Props) {
  return (
    <div className="bg-surface-raised text-fg rounded-xl shadow-xl border border-dashed border-line-strong p-3 w-[272px]">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Bookmark className="w-3 h-3 shrink-0 text-fg-subtle" aria-hidden="true" />
            <h3 className="font-bold text-[15px] text-fg m-0 truncate">{item.name}</h3>
          </div>
          <p className="m-0 mt-0.5 text-[11px] text-fg-subtle truncate">
            저장 안 함{item.category ? ` · ${item.category}` : ''}
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

      <p className="m-0 mt-1.5 text-xs text-fg-muted">{item.address}</p>

      <div className="mt-2.5 pt-2.5 border-t border-line-subtle">
        {unavailable ? (
          <p className="m-0 text-[11px] text-fg-subtle">평점 조회가 설정되지 않았습니다</p>
        ) : failed ? (
          <div className="flex items-center justify-between gap-2">
            <p className="m-0 text-[11px] text-[var(--matpin-closing)]">평점을 못 받아왔습니다</p>
            <button
              type="button"
              onClick={onRetry}
              className="shrink-0 inline-flex items-center gap-1 min-h-9 px-2 rounded-lg text-[11px] font-medium text-fg-muted hover:bg-surface-pressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <RotateCw className="w-3 h-3" aria-hidden="true" />
              다시 시도
            </button>
          </div>
        ) : (
          <RatingRow ratings={ratings} loading={loading} />
        )}
      </div>

      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 w-full flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-lg bg-surface-fill hover:bg-surface-pressed transition-colors text-sm font-medium text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        카카오맵에서 보기
        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
      </a>
    </div>
  );
}
