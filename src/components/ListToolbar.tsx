// 목록 위의 검색·필터 줄.
//
// 검색창 하나로 장소("강남역")·가게 이름·메뉴·동 이름을 다 받는다.
// 예전에는 "지도 범위 / 전체" 가 스위치였는데, 두 상태가 대등하므로 세그먼트가 맞다.
// 스위치는 "켜고 끄는 하나" 를 뜻한다.

import { Search, X, SlidersHorizontal } from 'lucide-react';
import { TextField, SegmentedControl } from '@seed-design/react';
import type { SortKey } from '../lib/url-state';

export const RADII = [300, 500, 1000, 2000];

interface Props {
  query: string;
  onQueryChange: (v: string) => void;
  onSubmit: () => void;
  scope: 'map' | 'all';
  onScopeChange: (v: 'map' | 'all') => void;

  /** 중심점이 잡혀 있으면 반경 칩을 보여준다 */
  nearLabel: string | null;
  radius: number;
  onRadiusChange: (r: number) => void;
  onClearNear: () => void;

  openOnly: boolean;
  onOpenOnlyChange: (v: boolean) => void;
  minScore: number | null;
  onMinScoreChange: (v: number | null) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  /** 거리순은 중심점이 있을 때만 쓸 수 있다 */
  canSortDistance: boolean;

  discover: boolean;
  onDiscoverChange: (v: boolean) => void;

  total: number;
}

const chip = (on: boolean) =>
  `shrink-0 min-h-9 px-3 rounded-full text-xs font-medium border transition-colors ` +
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ` +
  (on
    ? 'bg-primary text-on-primary border-primary'
    : 'bg-surface text-fg-muted border-line hover:bg-surface-pressed');

export function ListToolbar({
  query, onQueryChange, onSubmit, scope, onScopeChange,
  nearLabel, radius, onRadiusChange, onClearNear,
  openOnly, onOpenOnlyChange, minScore, onMinScoreChange,
  sort, onSortChange, canSortDistance, discover, onDiscoverChange, total,
}: Props) {
  return (
    <div className="px-3 pt-3 pb-2 border-b border-line-subtle shrink-0 flex flex-col gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        role="search"
      >
        {/* 아이콘은 TextField 의 PrefixIcon 슬롯에 넣는다.
            절대배치로 얹으면 입력 텍스트와 겹쳐 글자가 가려진다. */}
        <TextField.Root size="medium" className="w-full">
          <TextField.PrefixIcon svg={<Search aria-hidden="true" />} />
          <TextField.Input
            id="place-search"
            type="search"
            placeholder="강남역 · 가게 이름 · 김밥"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            aria-label="장소·가게·메뉴 검색"
            enterKeyHint="search"
          />
        </TextField.Root>
      </form>

      {nearLabel ? (
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {/* 칩 전체가 해제 버튼이다. 안에 20px 짜리 X 만 누르게 두면 손가락으로 못 맞춘다. */}
          <button
            type="button"
            onClick={onClearNear}
            aria-label={`${nearLabel} 중심 해제`}
            className="shrink-0 inline-flex items-center gap-1 min-h-9 text-xs font-semibold text-primary-fg bg-primary-weak px-3 rounded-full hover:bg-primary-weak-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {nearLabel}
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
          {RADII.map((r) => (
            <button key={r} type="button" onClick={() => onRadiusChange(r)} className={chip(radius === r)}>
              {r >= 1000 ? `${r / 1000}km` : `${r}m`}
            </button>
          ))}
        </div>
      ) : (
        <SegmentedControl.Root
          value={scope}
          onValueChange={(v) => onScopeChange(String(v) as 'map' | 'all')}
        >
          <SegmentedControl.Indicator />
          <SegmentedControl.Item value="map">
            지도 범위
            <SegmentedControl.ItemHiddenInput />
          </SegmentedControl.Item>
          <SegmentedControl.Item value="all">
            전체 {total.toLocaleString()}곳
            <SegmentedControl.ItemHiddenInput />
          </SegmentedControl.Item>
        </SegmentedControl.Root>
      )}

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide" role="group" aria-label="필터">
        <SlidersHorizontal className="w-3.5 h-3.5 shrink-0 text-fg-subtle" aria-hidden="true" />
        <button type="button" onClick={() => onOpenOnlyChange(!openOnly)} className={chip(openOnly)} aria-pressed={openOnly}>
          영업 중
        </button>
        <button
          type="button"
          onClick={() => onMinScoreChange(minScore === 4 ? null : 4)}
          className={chip(minScore === 4)}
          aria-pressed={minScore === 4}
        >
          평점 4.0+
        </button>
        <button type="button" onClick={() => onDiscoverChange(!discover)} className={chip(discover)} aria-pressed={discover}>
          주변 발견
        </button>

        <span className="shrink-0 w-px h-4 bg-line mx-0.5" aria-hidden="true" />

        <label className="sr-only" htmlFor="sort-select">정렬</label>
        <select
          id="sort-select"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="shrink-0 min-h-9 text-xs rounded-full px-2.5 bg-surface text-fg-muted border border-line focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {canSortDistance && <option value="distance">거리순</option>}
          <option value="rating">평점순</option>
          <option value="reviews">리뷰 많은순</option>
        </select>
      </div>
    </div>
  );
}
