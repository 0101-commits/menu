// 카드 목록.
//
// "전체" 를 켜면 4,000 곳이 한 번에 들어온다. 전부 그리면 스크롤이 끊기므로
// 화면에 닿는 만큼만 그리고 바닥에 닿으면 늘린다. 라이브러리를 넣을 일은 아니다.

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPinOff, X } from 'lucide-react';
import type { Place, RatingsMap } from '../types';
import { PlaceCard } from './PlaceCard';
import { haversine } from '../lib/geo';
import { listSignature } from '../lib/data';
import type { SourceMeans } from '../lib/rating';

const PAGE = 40;

interface Props {
  places: Place[];
  ratings: RatingsMap;
  means: SourceMeans;
  showGoogle: boolean;
  ratingsLoading: boolean;
  selectedPlaceId: string | null;
  /**
   * 지도에서 고른 가게. 목록 맨 위에 고정으로 세운다.
   *
   * 예전에는 고른 가게가 목록 어디에 있는지 알 방법이 없었다 — 한 번에 40장만 그리니
   * 41번째 이후면 아예 DOM 에도 없었고, 필터 밖이면 영영 안 보였다.
   * 여기 고정하면 "지도에는 있는데 목록에 없다" 가 사라진다.
   */
  pinned?: Place | null;
  onUnpin?: () => void;
  onSelect: (p: Place) => void;
  onDetail: (p: Place) => void;
  /** 거리 표시의 기준점. 없으면 거리를 안 보여준다. */
  origin: { lat: number; lng: number } | null;
  emptyHint?: string;
  /** 가본 곳 placeId 모음 */
  visited: Set<string>;
  /** 고른 가게로 목록을 스크롤할지(데스크톱). 모바일은 pinned 가 대신한다. */
  autoScroll?: boolean;
  /**
   * 지금 실제로 그린 카드들. 구글 평점을 "본 것만" 받아오는 쪽이 이걸 듣는다 —
   * 목록은 한 번에 40장만 그리므로, 여기서 알려주지 않으면 앱은 무엇이 화면에 있는지 모른다.
   */
  onRendered?: (places: Place[]) => void;
  /**
   * 목록을 처음부터 다시 보게 만드는 값. 검색어·필터·정렬처럼 **사용자가 바꾼 것** 만 여기 담는다.
   *
   * 지도를 미는 것으로는 되감지 않는다. 지도를 40px 만 밀어도 가장자리 가게가 들고 나면서
   * 목록 내용은 매번 달라지는데, 그때마다 맨 위로 돌아가면 "지도를 한 번 미는 대가로
   * 보던 자리를 잃는" 상태가 된다(실측으로 scrollTop 600 → 0).
   */
  resetKey?: string;
}

export function PlaceList({
  places, ratings, means, showGoogle, ratingsLoading,
  selectedPlaceId, pinned = null, onUnpin, onSelect, onDetail, origin, emptyHint, visited,
  autoScroll = false, onRendered, resetKey = '',
}: Props) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLLIElement>(null);
  const scroller = useRef<HTMLUListElement>(null);

  const signature = useMemo(() => listSignature(places), [places]);

  // 사용자가 조건을 바꿨을 때만 처음부터 다시 본다(위 resetKey 주석 참고).
  useEffect(() => {
    setLimit(PAGE);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [resetKey]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setLimit((n) => n + PAGE); },
      { root: scroller.current, rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
    // [places.length] 로 두면 개수가 같은 채 정렬만 바뀌었을 때 다시 붙지 않는다.
    // 위 effect 가 limit 을 되돌려 sentinel 이 새 DOM 노드로 다시 생기는데
    // 그 노드는 한 번도 observe 되지 않아 "더 보기" 가 조용히 멎는다.
  }, [signature]);

  // 고른 가게를 화면 가운데로. 데스크톱 전용이다 —
  // 모바일은 목록 본문이 카드 세 장 높이라, 스크롤해 봐야 다음 조작에 곧 사라진다.
  // 거기서는 맨 위 고정 슬롯(pinned)이 같은 일을 더 확실하게 한다.
  useEffect(() => {
    if (!autoScroll || !selectedPlaceId) return;
    const el = scroller.current?.querySelector<HTMLElement>(`[data-place="${CSS.escape(selectedPlaceId)}"]`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [autoScroll, selectedPlaceId, limit, signature]);

  // 고른 가게가 목록 안에도 있으면 위아래로 같은 카드가 두 번 서게 된다. 아래쪽을 뺀다.
  const shown = places.slice(0, limit).filter((p) => p.placeId !== pinned?.placeId);

  // 지도와 맞출 번호. 목록 순서 그대로 1번부터 20번까지.
  const numberOf = useMemo(
    () => new Map(places.slice(0, 20).map((p, i) => [p.placeId, i + 1] as const)),
    [places],
  );

  // 그린 것을 알린다. 렌더 중에 부르면 안 되므로 effect 로 미룬다.
  const rendered = pinned ? [pinned, ...shown] : shown;
  const renderedKey = `${signature}|${limit}|${pinned?.placeId ?? ''}`;
  const renderedRef = useRef(rendered);
  renderedRef.current = rendered;
  useEffect(() => { onRendered?.(renderedRef.current); }, [renderedKey, onRendered]);

  const pinnedCard = pinned && (
    <div className="shrink-0 px-3 pt-2 pb-1.5 bg-surface border-b border-line-subtle">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-1">
        <span className="text-xs font-semibold text-primary-fg">지도에서 고른 곳</span>
        {onUnpin && (
          <button
            type="button"
            onClick={onUnpin}
            aria-label="선택 해제"
            className="grid place-items-center w-11 h-11 -my-2 -mr-2 rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <ul className="m-0 p-0 list-none">
        <PlaceCard
          place={pinned}
          rank={numberOf.get(pinned.placeId)}
          ratings={ratings[pinned.placeId]}
          // 거리 기준점이 곧 이 가게일 때가 많다(지도에서 고르면 그렇게 된다). "0m" 은 적지 않는다.
          distanceKm={(() => {
            if (!origin) return undefined;
            const d = haversine(origin.lat, origin.lng, pinned.lat, pinned.lng);
            return d < 0.005 ? undefined : d;
          })()}
          selected
          onSelect={onSelect}
          onDetail={onDetail}
          means={means}
          showGoogle={showGoogle}
          ratingsLoading={ratingsLoading}
          visited={visited.has(pinned.placeId)}
        />
      </ul>
    </div>
  );

  if (places.length === 0) {
    return (
      <>
        {pinnedCard}
        <div className="flex-1 grid place-items-center p-6 text-center">
          <div>
            <MapPinOff className="w-8 h-8 mx-auto mb-3 text-fg-subtle" aria-hidden="true" />
            <p className="text-sm text-fg-muted m-0">찾는 맛집이 없습니다</p>
            {emptyHint && <p className="text-xs text-fg-subtle m-0 mt-1">{emptyHint}</p>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
    {pinnedCard}
    <ul ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 flex flex-col gap-2 m-0 list-none">
      {shown.map((place) => (
        <PlaceCard
          key={place.placeId}
          place={place}
          // 지도 마커에 붙은 번호와 같은 번호. 상위 20곳까지만 단다.
          rank={numberOf.get(place.placeId)}
          ratings={ratings[place.placeId]}
          distanceKm={origin ? haversine(origin.lat, origin.lng, place.lat, place.lng) : undefined}
          selected={selectedPlaceId === place.placeId}
          onSelect={onSelect}
          onDetail={onDetail}
          means={means}
          showGoogle={showGoogle}
          ratingsLoading={ratingsLoading}
          visited={visited.has(place.placeId)}
        />
      ))}
      {limit < places.length && (
        <li ref={sentinel} className="grid place-items-center py-4 text-xs text-fg-subtle">
          {places.length - limit}곳 더
        </li>
      )}
    </ul>
    </>
  );
}
