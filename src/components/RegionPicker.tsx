// 행정구역으로 좁히기. 시/도 → 시군구 → 동.
//
// 장소 검색("강남역")이 주 경로가 되면서 이건 보조가 됐다. 예전에는 접힌 채로도
// 제목 줄 하나가 목록 위에 상시로 붙어 있었는데, 그 자리를 필터 칩 하나로 옮겼다.
// 여기는 펼쳤을 때의 패널만 그린다 — 열고 닫는 판단은 툴바가 한다.
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

  return (
    <div className="px-3 pb-2 border-b border-line-subtle shrink-0">
      <div className="flex gap-1.5">
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

      {(sido || sigungu || dong) && (
        <button
          type="button"
          onClick={() => onChange({ sido: '', sigungu: '', dong: '' })}
          className="mt-1 min-h-9 px-1 text-xs font-medium text-primary-fg hover:underline rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          행정구역 해제
        </button>
      )}
    </div>
  );
}

/** 칩에 적을 말. 아무것도 안 걸렸으면 null. */
export function regionLabelOf(r: { sido: string; sigungu: string; dong: string }): string | null {
  const parts = [r.sido, r.sigungu, r.dong].filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}
