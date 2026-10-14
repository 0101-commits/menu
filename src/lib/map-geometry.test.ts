import { describe, expect, it } from 'vitest';
import { markerTier, nearbyRadiusForLevel, numberAssignments, popupCenterShift } from './map-geometry';

describe('map geometry', () => {
  it.each([[2, 30], [3, 60], [4, 120], [5, 250], [6, 500], [7, 800]])(
    '지도 레벨 %i의 주변 반경은 %im', (level, radius) => {
      expect(nearbyRadiusForLevel(level)).toBe(radius);
    },
  );

  it('팝업이 들어갈 가시 영역이면 중심 이동량을 계산한다', () => {
    expect(popupCenterShift(800, 300, 224, 28)).toBe(400 - (500 - 28));
  });

  it('가시 영역이 팝업보다 좁으면 보정하지 않는다', () => {
    expect(popupCenterShift(800, 600, 224, 28)).toBeNull();
  });

  it.each([[1, 'pin'], [4, 'pin'], [5, 'dot'], [6, 'dot'], [7, 'dotSmall'], [14, 'dotSmall']])(
    '지도 레벨 %i의 핀 모양은 %s', (level, tier) => {
      expect(markerTier(level)).toBe(tier);
    },
  );

  it('번호 할당을 상한에서 자른다', () => {
    expect([...numberAssignments(['a', 'b', 'c'], 2)]).toEqual([['a', 1], ['b', 2]]);
  });
});
