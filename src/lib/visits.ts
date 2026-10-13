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
