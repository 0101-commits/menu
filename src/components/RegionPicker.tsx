// 행정구역으로 좁히기. 시/도 → 시군구 → 동.
//
// 장소 검색("강남역")이 주 경로가 되면서 이건 보조가 됐다. 항상 펼쳐 두면
// 목록 위 공간을 계속 먹으므로 접어 둔다. 정확한 구역 단위가 필요할 때만 연다.
//
// 예전에는 주소 문자열을 매번 split 해서 만들었고 "수원시 팔달구 신풍동" 같은 주소에서
// 동 자리에 구가 들어갔다. 이제 places.json 에 sido/sigungu/dong 이 이미 들어 있다.

import { useMemo } from 'react';
import type { Place } from '../types';

interface Props {
  places: Place[];
  sido: string;
  sigungu: string;
  dong: string;
  onChange: (next: { sido: string; sigungu: string; dong: string }) => void;
}

const SELECT =
  'flex-1 min-w-0 text-sm min-h-11 rounded-lg px-2 bg-surface text-fg ' +
  'border border-line focus:outline-none focus-visible:outline focus-visible:outline-2 ' +
  'focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-40';

export function RegionPicker({ places, sido, sigungu, dong, onChange }: Props) {
  const sidoList = useMemo(
    () => [...new Set(places.map((p) => p.sido).filter(Boolean))].sort(),
    [places],
  );
  const sigunguList = useMemo(
    () => [...new Set(places.filter((p) => !sido || p.sido === sido).map((p) => p.sigungu).filter(Boolean))].sort(),
    [places, sido],
  );
  const dongList = useMemo(
    () =>
      [...new Set(
        places
          .filter((p) => (!sido || p.sido === sido) && (!sigungu || p.sigungu === sigungu))
          .map((p) => p.dong)
          .filter(Boolean),
      )].sort(),
    [places, sido, sigungu],
  );

  const active = Boolean(sido || sigungu || dong);

  return (
    <details className="px-3 py-2 border-b border-line-subtle shrink-0" open={active}>
      <summary className="flex items-center justify-between gap-2 cursor-pointer list-none min-h-9 text-xs font-medium text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary rounded">
        <span>행정구역으로 찾기{active ? ` · ${[sido, sigungu, dong].filter(Boolean).join(' ')}` : ''}</span>
        {active && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.preventDefault(); onChange({ sido: '', sigungu: '', dong: '' }); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onChange({ sido: '', sigungu: '', dong: '' }); } }}
            className="text-primary-fg hover:underline px-1"
          >
            해제
          </span>
        )}
      </summary>

      <div className="flex gap-1.5 mt-2">
        <label className="sr-only" htmlFor="region-sido">시/도</label>
        <select
          id="region-sido"
          value={sido}
          onChange={(e) => onChange({ sido: e.target.value, sigungu: '', dong: '' })}
          className={SELECT}
        >
          <option value="">시/도</option>
          {sidoList.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="sr-only" htmlFor="region-sigungu">시/군/구</label>
        <select
          id="region-sigungu"
          value={sigungu}
          onChange={(e) => onChange({ sido, sigungu: e.target.value, dong: '' })}
          disabled={!sido}
          className={SELECT}
        >
          <option value="">시/군/구</option>
          {sigunguList.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <label className="sr-only" htmlFor="region-dong">동/읍/면</label>
        <select
          id="region-dong"
          value={dong}
          onChange={(e) => onChange({ sido, sigungu, dong: e.target.value })}
          disabled={!sigungu}
          className={SELECT}
        >
          <option value="">동/읍/면</option>
          {dongList.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </details>
  );
}
