import { describe, expect, it } from 'vitest';
import { mergeVisits, parseVisitsJson, serializeVisits, validateVisits, type Visits } from './visits';

const oldVisit = { at: '2026-09-01T00:00:00.000Z', note: '기존 메모' };
const newVisit = { at: '2026-09-20T00:00:00.000Z' };

describe('visit file', () => {
  it('새 포맷을 내보내고 다시 읽는다', () => {
    const visits = { a: oldVisit };
    expect(parseVisitsJson(serializeVisits(visits, new Date('2026-09-21T00:00:00Z')))).toEqual(visits);
  });

  it('예전 원시 Record 포맷도 읽는다', () => {
    expect(parseVisitsJson(JSON.stringify({ a: oldVisit }))).toEqual({ a: oldVisit });
  });

  it('날짜와 메모 타입을 검증한다', () => {
    expect(() => validateVisits({ a: { at: 'not-a-date' } })).toThrow('올바르지 않습니다');
    expect(() => validateVisits({ a: { at: oldVisit.at, note: 3 } })).toThrow('메모 형식');
  });

  it('지원하지 않는 버전을 거부한다', () => {
    expect(() => parseVisitsJson(JSON.stringify({ kind: 'matpin-visits', version: 99, visits: {} })))
      .toThrow('지원하지 않는');
  });
});

describe('mergeVisits', () => {
  it('새 장소는 추가하고 최신 기록은 갱신한다', () => {
    const current: Visits = { a: oldVisit };
    const incoming: Visits = { a: newVisit, b: newVisit };
    const result = mergeVisits(current, incoming);
    expect(result.visits).toEqual({
      a: { at: newVisit.at, note: '기존 메모' },
      b: newVisit,
    });
    expect(result.summary).toEqual({ imported: 1, updated: 1, kept: 0, total: 2 });
  });

  it('오래된 가져오기는 현재 기록을 덮지 않는다', () => {
    const result = mergeVisits({ a: newVisit }, { a: oldVisit });
    expect(result.visits.a).toEqual(newVisit);
    expect(result.summary.kept).toBe(1);
  });

  it('같은 파일을 두 번 병합해도 결과가 달라지지 않는다', () => {
    const first = mergeVisits({}, { a: newVisit });
    const second = mergeVisits(first.visits, { a: newVisit });
    expect(second.visits).toEqual(first.visits);
    expect(second.summary).toEqual({ imported: 0, updated: 0, kept: 1, total: 1 });
  });
});
