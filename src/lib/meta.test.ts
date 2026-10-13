import { describe, expect, it } from 'vitest';
import { coverage, formatMetaDate } from './meta';

describe('data meta formatting', () => {
  it('커버리지를 소수 한 자리로 표시한다', () => {
    expect(coverage(3613, 4084)).toBe('88.5%');
    expect(coverage(0, 0)).toBe('0%');
  });

  it('서울 기준 날짜로 표시한다', () => {
    expect(formatMetaDate('2026-09-20T18:00:00.000Z')).toContain('2026');
    expect(formatMetaDate('bad')).toBe('기준일 알 수 없음');
  });
});
