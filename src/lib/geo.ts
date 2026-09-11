// 거리 계산. App·PlaceList·MapView 가 각자 복사본을 들고 있던 것을 한 곳으로 모았다.

/** 두 좌표 사이 거리(km) */
export function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** 1km 미만은 m, 그 이상은 소수 한 자리 km */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

/** 미터 단위가 필요한 곳(지도 반경 판정)에서 쓴다. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return haversine(lat1, lng1, lat2, lng2) * 1000;
}

/**
 * 반경(m)에 맞는 카카오 지도 레벨.
 * setBounds 를 쓸 수 없는 경우(결과 0건)의 폴백이다.
 */
export function levelForRadius(radiusM: number): number {
  if (radiusM <= 300) return 4;
  if (radiusM <= 500) return 5;
  if (radiusM <= 1000) return 6;
  if (radiusM <= 2000) return 7;
  return 8;
}
