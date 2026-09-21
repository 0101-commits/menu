// 목록 위의 검색·필터 줄.
//
// 검색창 하나로 장소("강남역")·가게 이름·메뉴·동 이름을 다 받는다.
// 예전에는 "지도 범위 / 전체" 가 스위치였는데, 두 상태가 대등하므로 세그먼트가 맞다.
// 스위치는 "켜고 끄는 하나" 를 뜻한다.
//
// 줄을 성격으로 나눈다. 예전에는 지름길 버튼·토글 칩·정렬이 한 줄에 다 있어서
// 384px 패널에서 "평점 4.0+" 가 "평…" 으로 잘렸고, 스크롤 막대까지 숨겨 둬서
// 더 있다는 신호조차 없었다.
//
//   윗줄  한 번에 상태를 바꾸는 것들 — 지금 갈 만한 곳 · 주변 발견 · 정렬
//   아랫줄 목록을 좁히는 토글 — 영업 중 · 안 가본 곳 · 평점 · 행정구역

import { useEffect, useState } from 'react';
import { Search, X, SlidersHorizontal, ChevronDown, ChevronUp } from 'lucide-react';
import { TextField, SegmentedControl } from '@seed-design/react';
import type { SortKey } from '../lib/url-state';

const RADII = [300, 500, 1000, 2000];

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
  /** 영업시간 데이터가 아직 없으면 이 필터는 쓸 수 없다 */
  openOnlyAvailable: boolean;
  minScore: number | null;
  onMinScoreChange: (v: number | null) => void;
  sort: SortKey;
  onSortChange: (v: SortKey) => void;
  /** 거리순은 중심점이 있을 때만 쓸 수 있다 */
  canSortDistance: boolean;

  discover: boolean;
  onDiscoverChange: (v: boolean) => void;

  unvisitedOnly: boolean;
  onUnvisitedOnlyChange: (v: boolean) => void;

  /** 지도를 움직이면 목록도 따라갈지. 끄면 목록이 얼고 지도에 "이 지역에서 다시 찾기" 가 뜬다 */
  follow: boolean;
  onFollowChange: (v: boolean) => void;
  /** 현위치 1km · 영업 중 · 평점순을 한 번에 건다 */
  onPickNow: () => void;

  /** 행정구역 패널이 열려 있는가 */
  regionOpen: boolean;
  onRegionOpenChange: (v: boolean) => void;
  /** 행정구역이 실제로 걸려 있으면 칩에 그 이름을 적는다 */
  regionLabel: string | null;

  total: number;
  /** 데스크톱은 공간이 남으므로 늘 펼쳐 둔다. 모바일만 접는다. */
  alwaysExpanded?: boolean;
  /** 검색줄 바로 아래에 늘 서는 것(음식 종류 칩). 접어도 사라지지 않는다. */
  children?: React.ReactNode;
}

const STORE_KEY = 'matpin-toolbar-expanded';

function readExpanded() {
  try { return localStorage.getItem(STORE_KEY) === '1'; } catch { return false; }
}

// 목록에서 가장 자주 누르는 것들이라 44px 로 맞춘다. 나머지 컨트롤과 같은 기준이다.
const chip = (on: boolean) =>
  `shrink-0 min-h-11 px-3.5 rounded-full text-xs font-medium border transition-colors ` +
  `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ` +
  (on
    ? 'bg-primary text-on-primary border-primary'
    : 'bg-surface text-fg-muted border-line hover:bg-surface-pressed');

// 줄이 넘칠 때 오른쪽 끝을 흐리게 해서 "더 있다" 를 알린다. 막대는 숨겨 둔 상태다.
const SCROLL_ROW =
  'flex items-center gap-1.5 overflow-x-auto scrollbar-hide ' +
  '[mask-image:linear-gradient(to_right,black_calc(100%-24px),transparent)]';

export function ListToolbar({
  query, onQueryChange, onSubmit, scope, onScopeChange,
  nearLabel, radius, onRadiusChange, onClearNear,
  openOnly, onOpenOnlyChange, openOnlyAvailable, minScore, onMinScoreChange,
  sort, onSortChange, canSortDistance, discover, onDiscoverChange,
  unvisitedOnly, onUnvisitedOnlyChange, onPickNow, follow, onFollowChange,
  regionOpen, onRegionOpenChange, regionLabel, total,
  alwaysExpanded = false, children,
}: Props) {
  const [open, setOpen] = useState(readExpanded);
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, open ? '1' : '0'); } catch { /* 프라이빗 모드 */ }
  }, [open]);

  const expanded = alwaysExpanded || open;

  // 접었을 때도 몇 개가 걸려 있는지는 보여야 한다. 안 그러면 "왜 이것밖에 안 나오지" 가 된다.
  const activeCount =
    (openOnly ? 1 : 0) + (unvisitedOnly ? 1 : 0) + (minScore != null ? 1 : 0) +
    (regionLabel ? 1 : 0) + (discover ? 1 : 0) + (scope === 'all' ? 1 : 0);

  return (
    <div className="px-3 pt-2 pb-2 border-b border-line-subtle shrink-0 flex flex-col gap-2">
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
        role="search"
        className="flex items-center gap-1.5"
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
        {!alwaysExpanded && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
            aria-label={`필터${activeCount ? ` (${activeCount}개 적용됨)` : ''}`}
            className={`shrink-0 inline-flex items-center gap-0.5 min-h-11 px-2.5 rounded-full text-xs font-semibold border transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              activeCount
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface text-fg-muted border-line hover:bg-surface-pressed'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            {activeCount > 0 && <span className="tabular-nums">{activeCount}</span>}
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
          </button>
        )}
      </form>

      {/* 음식 종류 칩. 지도 위 고정 바로 두면 60px 를 늘 먹는다 — 목록 안으로 들였다. */}
      {children}

      {!expanded ? null : nearLabel ? (
        <div className={SCROLL_ROW}>
          {/* 칩 전체가 해제 버튼이다. 안에 20px 짜리 X 만 누르게 두면 손가락으로 못 맞춘다. */}
          <button
            type="button"
            onClick={onClearNear}
            aria-label={`${nearLabel} 중심 해제`}
            className="shrink-0 inline-flex items-center gap-1 min-h-11 text-xs font-semibold text-primary-fg bg-primary-weak px-3.5 rounded-full hover:bg-primary-weak-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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

      {/* 상태를 바꾸는 줄. 토글 칩과 성격이 다르니 생김새와 자리를 나눈다. */}
      {expanded && (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPickNow}
          className="shrink-0 inline-flex items-center gap-1 min-h-11 px-3.5 rounded-full text-xs font-semibold bg-primary text-on-primary hover:bg-primary-pressed transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          지금 갈 만한 곳
        </button>
        <button
          type="button"
          onClick={() => onDiscoverChange(!discover)}
          className={chip(discover)}
          aria-pressed={discover}
        >
          주변 발견
        </button>

        <label className="sr-only" htmlFor="sort-select">정렬</label>
        <select
          id="sort-select"
          value={sort}
          onChange={(e) => onSortChange(e.target.value as SortKey)}
          className="ml-auto shrink-0 min-h-11 text-xs rounded-full px-2.5 bg-surface text-fg-muted border border-line focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {canSortDistance && <option value="distance">거리순</option>}
          <option value="rating">평점순</option>
          <option value="reviews">리뷰 많은순</option>
        </select>
      </div>
      )}

      {/* 목록을 좁히는 줄. 전부 같은 모양의 토글이다. */}
      {expanded && (
      <div className={SCROLL_ROW} role="group" aria-label="필터">
        {/* 데이터가 없으면 눌러도 0곳이 된다. 막아 두고 이유를 붙인다. */}
        <button
          type="button"
          onClick={() => onOpenOnlyChange(!openOnly)}
          className={`${chip(openOnly)} disabled:opacity-40 disabled:cursor-not-allowed`}
          aria-pressed={openOnly}
          disabled={!openOnlyAvailable}
          title={openOnlyAvailable ? undefined : '영업시간 데이터가 아직 없습니다 (카카오 매칭 필요)'}
        >
          영업 중
        </button>
        <button
          type="button"
          onClick={() => onFollowChange(!follow)}
          className={chip(!follow)}
          aria-pressed={!follow}
          title={follow ? '지도를 움직이면 목록도 바뀐다' : '목록이 지금 자리에 고정돼 있다'}
        >
          {follow ? '지도 따라감' : '목록 고정'}
        </button>
        <button
          type="button"
          onClick={() => onUnvisitedOnlyChange(!unvisitedOnly)}
          className={chip(unvisitedOnly)}
          aria-pressed={unvisitedOnly}
        >
          안 가본 곳
        </button>
        <button
          type="button"
          onClick={() => onMinScoreChange(minScore === 4 ? null : 4)}
          className={chip(minScore === 4)}
          aria-pressed={minScore === 4}
        >
          평점 4.0+
        </button>
        <button
          type="button"
          onClick={() => onRegionOpenChange(!regionOpen)}
          className={chip(Boolean(regionLabel))}
          aria-pressed={Boolean(regionLabel)}
          aria-expanded={regionOpen}
        >
          {regionLabel ?? '행정구역'}
        </button>
      </div>
      )}
    </div>
  );
}
