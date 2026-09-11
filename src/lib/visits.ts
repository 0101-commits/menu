// 가본 곳 표시와 한 줄 메모.
//
// 네이버 즐겨찾기는 읽기만 한다(수집 파이프라인이 단방향이다). 그래서 이 기록은
// 이 브라우저에만 남는다. 서버를 두지 않는 대신 내보내기를 제공한다.

import { useCallback, useEffect, useState } from 'react';

const KEY = 'matpin-visits';

export interface Visit {
  /** 마지막 방문 표시 시각 */
  at: string;
  note?: string;
}

export type Visits = Record<string, Visit>;

function read(): Visits {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Visits) : {};
  } catch {
    return {}; // 프라이빗 모드·저장소 차단
  }
}

function write(v: Visits) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch { /* 저장 못 해도 화면은 그대로 돈다 */ }
}

export function useVisits() {
  const [visits, setVisits] = useState<Visits>(read);

  // 다른 탭에서 바꾼 것도 따라간다.
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === KEY) setVisits(read()); };
    window.addEventListener('storage', on);
    return () => window.removeEventListener('storage', on);
  }, []);

  const toggle = useCallback((placeId: string) => {
    setVisits((prev) => {
      const next = { ...prev };
      if (next[placeId]) delete next[placeId];
      else next[placeId] = { at: new Date().toISOString() };
      write(next);
      return next;
    });
  }, []);

  const setNote = useCallback((placeId: string, note: string) => {
    setVisits((prev) => {
      const cur = prev[placeId] ?? { at: new Date().toISOString() };
      const next = { ...prev, [placeId]: { ...cur, note: note.trim() || undefined } };
      write(next);
      return next;
    });
  }, []);

  /** 브라우저를 옮기거나 지울 때를 위해. 파일 하나로 떨어진다. */
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(visits, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matpin-visits-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visits]);

  return { visits, toggle, setNote, exportJson };
}
