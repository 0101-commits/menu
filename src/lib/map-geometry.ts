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

export function dominantColor(colors: Array<string | undefined>): string | null {
  const tally = new Map<string, number>();
  for (const color of colors) if (color) tally.set(color, (tally.get(color) ?? 0) + 1);
  let top: string | null = null;
  let count = 0;
  for (const [color, n] of tally) {
    if (n > count) { top = color; count = n; }
  }
  return top;
}

export function numberAssignments(ids: string[], limit = 20): Map<string, number> {
  return new Map(ids.slice(0, limit).map((id, index) => [id, index + 1]));
}
