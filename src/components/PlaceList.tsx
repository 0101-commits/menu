// 카드 목록.
//
// "전체" 를 켜면 4,000 곳이 한 번에 들어온다. 전부 그리면 스크롤이 끊기므로
// 화면에 닿는 만큼만 그리고 바닥에 닿으면 늘린다. 라이브러리를 넣을 일은 아니다.

import { useEffect, useRef, useState } from 'react';
import { MapPinOff } from 'lucide-react';
import type { Place, RatingsMap } from '../types';
import { PlaceCard } from './PlaceCard';
import { haversine } from '../lib/geo';
import type { SourceMeans } from '../lib/rating';

const PAGE = 40;

interface Props {
  places: Place[];
  ratings: RatingsMap;
  means: SourceMeans;
  showGoogle: boolean;
  ratingsLoading: boolean;
  selectedPlaceId: string | null;
  onSelect: (p: Place) => void;
  onDetail: (p: Place) => void;
  /** 거리 표시의 기준점. 없으면 거리를 안 보여준다. */
  origin: { lat: number; lng: number } | null;
  emptyHint?: string;
  /** 가본 곳 placeId 모음 */
  visited: Set<string>;
}

export function PlaceList({
  places, ratings, means, showGoogle, ratingsLoading,
  selectedPlaceId, onSelect, onDetail, origin, emptyHint, visited,
}: Props) {
  const [limit, setLimit] = useState(PAGE);
  const sentinel = useRef<HTMLLIElement>(null);
  const scroller = useRef<HTMLUListElement>(null);

  // 목록이 바뀌면 처음부터 다시 본다. 스크롤 위치도 되돌린다.
  useEffect(() => {
    setLimit(PAGE);
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [places]);

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
  }, [places]);

  if (places.length === 0) {
    return (
      <div className="flex-1 grid place-items-center p-6 text-center">
        <div>
          <MapPinOff className="w-8 h-8 mx-auto mb-3 text-fg-subtle" aria-hidden="true" />
          <p className="text-sm text-fg-muted m-0">찾는 맛집이 없습니다</p>
          {emptyHint && <p className="text-xs text-fg-subtle m-0 mt-1">{emptyHint}</p>}
        </div>
      </div>
    );
  }

  const shown = places.slice(0, limit);

  return (
    <ul ref={scroller} className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 m-0 list-none">
      {shown.map((place) => (
        <PlaceCard
          key={place.placeId}
          place={place}
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
  );
}
