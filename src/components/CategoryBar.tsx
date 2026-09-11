// 지도 위 카테고리 칩 줄.
//
// 대분류가 14 종이라 좁은 화면에서는 한 줄에 안 들어가고 가로로 계속 밀린다.
// 기본은 6 개 색군으로 접어 두고, 필요할 때만 14 종을 펼친다.
// 색군은 마커 색과 같은 묶음이라 지도와 칩이 같은 언어를 쓴다.

import { useEffect, useState } from 'react';
import { Chip } from '@seed-design/react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { CATEGORY_GROUPS, OTHER_GROUP, categoriesInGroupOrder, groupOf } from '../lib/categories';

const STORE_KEY = 'matpin-category-expanded';

interface Props {
  /** 데이터에 실제로 있는 대분류 */
  available: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  counts?: Record<string, number>;
}

function readExpanded() {
  try {
    return localStorage.getItem(STORE_KEY) === '1';
  } catch {
    return false;
  }
}

export function CategoryBar({ available, selected, onChange, counts }: Props) {
  const [expanded, setExpanded] = useState(readExpanded);

  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, expanded ? '1' : '0'); } catch { /* 프라이빗 모드 */ }
  }, [expanded]);

  const all = selected.length === 0;
  const groups = [...CATEGORY_GROUPS, OTHER_GROUP].filter((g) =>
    g.members.some((m) => available.includes(m)),
  );

  // 접힌 상태에서 그 군이 켜졌는지 = 그 군의 대분류가 하나라도 선택됐는지
  const groupOn = (key: string) =>
    selected.some((c) => groupOf(c).key === key);

  const toggleGroup = (key: string) => {
    const members = [...CATEGORY_GROUPS, OTHER_GROUP].find((g) => g.key === key)!.members
      .filter((m) => available.includes(m));
    const on = groupOn(key);
    onChange(
      on
        ? selected.filter((c) => groupOf(c).key !== key)
        : [...new Set([...selected, ...members])],
    );
  };

  const toggleCategory = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 overflow-x-auto scrollbar-hide"
      role="group"
      aria-label="음식 종류 필터"
    >
      {/* 선택 상태는 SEED 가 data-checked 로 표현한다(중립 반전 필).
          variant 를 갈아끼우는 것보다 시스템의 대비 보장을 그대로 쓰는 편이 안전하다. */}
      <Chip.Root
        size="large"
        variant="solid"
        data-checked={all || undefined}
        aria-pressed={all}
        onClick={() => onChange([])}
        className="shrink-0"
      >
        <Chip.Label data-checked={all || undefined}>전체</Chip.Label>
      </Chip.Root>

      {expanded
        ? categoriesInGroupOrder(available).map((cat) => {
            const on = selected.includes(cat);
            return (
              <Chip.Root
                key={cat}
                size="large"
                variant="solid"
                data-checked={on || undefined}
                aria-pressed={on}
                onClick={() => toggleCategory(cat)}
                className="shrink-0"
              >
                <Chip.Label data-checked={on || undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: groupOf(cat).color }}
                    />
                    {cat}
                    {counts?.[cat] ? <span className="opacity-60 tabular-nums">{counts[cat]}</span> : null}
                  </span>
                </Chip.Label>
              </Chip.Root>
            );
          })
        : groups.map((g) => {
            const on = groupOn(g.key);
            return (
              <Chip.Root
                key={g.key}
                size="large"
                variant="solid"
                data-checked={on || undefined}
                aria-pressed={on}
                onClick={() => toggleGroup(g.key)}
                className="shrink-0"
              >
                <Chip.Label data-checked={on || undefined}>
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                    {g.label}
                  </span>
                </Chip.Label>
              </Chip.Root>
            );
          })}

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="shrink-0 flex items-center gap-0.5 min-h-11 px-2 text-xs font-medium text-fg-muted hover:text-fg rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {expanded ? '접기' : '자세히'}
        {expanded ? <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" /> : <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />}
      </button>
    </div>
  );
}
