// 가본 곳 표시와 한 줄 메모.
//
// 네이버 즐겨찾기는 읽기만 한다(수집 파이프라인이 단방향이다). 그래서 이 기록은
// 이 브라우저에만 남는다. 서버를 두지 않는 대신 검증된 파일 백업·복원을 제공한다.

import { useCallback, useEffect, useState } from 'react';

export const VISITS_KEY = 'matpin-visits';
const FILE_KIND = 'matpin-visits';
const FILE_VERSION = 1;
const MAX_IMPORT_BYTES = 2_000_000;

export interface Visit {
  /** 마지막 방문 표시 시각 */
  at: string;
  note?: string;
}

export type Visits = Record<string, Visit>;

export interface VisitsFile {
  kind: typeof FILE_KIND;
  version: typeof FILE_VERSION;
  exportedAt: string;
  visits: Visits;
}

export interface ImportSummary {
  imported: number;
  updated: number;
  kept: number;
  total: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateVisits(value: unknown): Visits {
  if (!isRecord(value)) throw new Error('방문기록 형식이 아닙니다.');
  const out: Visits = {};
  for (const [placeId, raw] of Object.entries(value)) {
    if (!placeId.trim() || !isRecord(raw) || typeof raw.at !== 'string' || !Number.isFinite(Date.parse(raw.at))) {
      throw new Error(`방문기록 항목이 올바르지 않습니다: ${placeId || '(빈 ID)'}`);
    }
    if (raw.note != null && typeof raw.note !== 'string') {
      throw new Error(`메모 형식이 올바르지 않습니다: ${placeId}`);
    }
    out[placeId] = {
      at: new Date(raw.at).toISOString(),
      ...(typeof raw.note === 'string' && raw.note.trim() ? { note: raw.note.trim() } : {}),
    };
  }
  return out;
}

export function parseVisitsJson(text: string): Visits {
  if (new Blob([text]).size > MAX_IMPORT_BYTES) throw new Error('방문기록 파일이 너무 큽니다.');
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽지 못했습니다.'); }
  if (isRecord(parsed) && parsed.kind === FILE_KIND) {
    if (parsed.version !== FILE_VERSION) throw new Error('지원하지 않는 방문기록 파일 버전입니다.');
    return validateVisits(parsed.visits);
  }
  // 2026-09 이전 exportJson이 만든 원시 Record 파일도 복원한다.
  return validateVisits(parsed);
}

export function mergeVisits(current: Visits, incoming: Visits): { visits: Visits; summary: ImportSummary } {
  const visits = { ...current };
  let imported = 0;
  let updated = 0;
  let kept = 0;

  for (const [placeId, next] of Object.entries(incoming)) {
    const prev = visits[placeId];
    if (!prev) {
      visits[placeId] = next;
      imported++;
      continue;
    }
    if (Date.parse(next.at) > Date.parse(prev.at)) {
      // 새 기록에 메모가 없다고 기존 메모를 파괴하지 않는다. 기본 병합은 비파괴적이다.
      visits[placeId] = { ...prev, ...next, note: next.note ?? prev.note };
      updated++;
    } else {
      kept++;
    }
  }
  return { visits, summary: { imported, updated, kept, total: Object.keys(visits).length } };
}

export function serializeVisits(visits: Visits, now = new Date()): string {
  const file: VisitsFile = {
    kind: FILE_KIND,
    version: FILE_VERSION,
    exportedAt: now.toISOString(),
    visits,
  };
  return JSON.stringify(file, null, 2);
}

function read(): Visits {
  try {
    const raw = localStorage.getItem(VISITS_KEY);
    return raw ? validateVisits(JSON.parse(raw)) : {};
  } catch {
    return {}; // 프라이빗 모드·저장소 차단·손상 데이터
  }
}

function write(visits: Visits): boolean {
  try {
    localStorage.setItem(VISITS_KEY, JSON.stringify(visits));
    return true;
  } catch {
    return false;
  }
}

/**
 * 옛 주소(0101-commits.github.io/menu)가 새 주소로 넘길 때 방문기록·화면 설정을 주소 뒤 #carry= 에 실어 보낸다.
 * localStorage 는 주소마다 따로라서 이렇게 들고 오지 않으면 기록이 옛 주소에 남는다. # 뒤는 서버로 가지 않는다.
 * 받은 기록은 지금 기록과 합치고(더 최신 방문 우선) 주소창에서 지운다. 화면을 그리기 전에 한 번 부른다.
 */
export const CARRY_FROM = 'https://0101-commits.github.io/';

export function importCarried(now = new Date()): ImportSummary | null {
  if (typeof window === 'undefined' || !location.hash.startsWith('#carry=')) return null;
  let summary: ImportSummary | null = null;
  try {
    // 아무나 #carry= 링크를 만들어 남의 기록에 끼워 넣지 못하게, 옛 주소에서 넘어온 경우만 받는다.
    // 옛 주소의 넘김 페이지(redirect/index.html)가 location.replace 로 보내므로 referrer 가 옛 주소다.
    if (!document.referrer.startsWith(CARRY_FROM)) throw new Error('not from old origin');
    const raw = location.hash.slice('#carry='.length);
    if (raw.length > MAX_IMPORT_BYTES) throw new Error('too large');
    const payload: unknown = JSON.parse(decodeURIComponent(raw));
    if (isRecord(payload)) {
      if (payload.v !== undefined) {
        // 미래 시각은 "더 최신" 으로 늘 이겨 버리므로 버린다(하루 여유).
        const limit = now.getTime() + 86_400_000;
        const incoming = Object.fromEntries(
          Object.entries(validateVisits(payload.v)).filter(([, visit]) => Date.parse(visit.at) <= limit),
        );
        const merged = mergeVisits(read(), incoming);
        if (write(merged.visits)) summary = merged.summary;
      }
      if (payload.s === 'dark' || payload.s === 'light') {
        localStorage.setItem('matpin-color-scheme', payload.s);
        document.documentElement.setAttribute('data-seed-user-color-scheme', payload.s);
      }
    }
  } catch {
    // 잘린 주소·손상 데이터 — 새 주소는 그대로 쓸 수 있게 조용히 넘어간다
  }
  history.replaceState(history.state, '', location.pathname + location.search);
  return summary;
}

export function useVisits() {
  const [visits, setVisits] = useState<Visits>(read);

  useEffect(() => {
    const on = (event: StorageEvent) => { if (event.key === VISITS_KEY) setVisits(read()); };
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

  const exportJson = useCallback(() => {
    const blob = new Blob([serializeVisits(visits)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `matpin-visits-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [visits]);

  const importJson = useCallback((text: string): ImportSummary => {
    const incoming = parseVisitsJson(text);
    const merged = mergeVisits(read(), incoming);
    if (!write(merged.visits)) throw new Error('브라우저에 방문기록을 저장하지 못했습니다.');
    setVisits(merged.visits);
    return merged.summary;
  }, []);

  return { visits, toggle, setNote, exportJson, importJson };
}
