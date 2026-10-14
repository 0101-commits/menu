/** 지도 빈 곳을 눌렀을 때 주변으로 볼 반경. */
export function nearbyRadiusForLevel(level: number): number {
  if (level <= 2) return 30;
  if (level <= 3) return 60;
  if (level <= 4) return 120;
  if (level <= 5) return 250;
  if (level <= 6) return 500;
  return 800;
}

/**
 * 전체 지도 중심과 시트 위 가시 영역 사이의 픽셀 차이.
 * null이면 가시 띠가 팝업보다 좁아 보정할 수 없다.
 */
export function popupCenterShift(
  mapHeight: number,
  bottomInset: number,
  popupSpace: number,
  gap: number,
): number | null {
  const visibleHeight = mapHeight - bottomInset;
  if (visibleHeight < popupSpace + 40) return null;
  const shift = mapHeight / 2 - (visibleHeight - gap);
  return Math.abs(shift) > 1 ? shift : 0;
}

export type MarkerTier = 'pin' | 'dot' | 'dotSmall';

/**
 * 지도 레벨별 핀 모양. 숫자 묶음(클러스터) 대신 네이버 지도처럼 모든 가게를 제자리에 찍되,
 * 멀어질수록 작은 점으로 그려 수천 곳이 겹쳐도 바탕 지도가 덮이지 않게 한다.
 */
export function markerTier(level: number): MarkerTier {
  if (level <= 4) return 'pin';
  if (level <= 6) return 'dot';
  return 'dotSmall';
}

export function numberAssignments(ids: string[], limit = 20): Map<string, number> {
  return new Map(ids.slice(0, limit).map((id, index) => [id, index + 1]));
}
