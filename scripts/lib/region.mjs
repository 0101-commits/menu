// 지번 주소를 시/도 · 시군구 · 동으로 나눈다. 빌드 타임에 한 번만 돌고
// 결과는 places.json 에 필드로 박힌다. 앱은 다시 쪼개지 않는다.
//
// 예전 PlaceList 는 address.split(' ') 의 0·1·2 번째를 그대로 썼다.
// 그래서 "경기도 수원시 팔달구 신풍동" 처럼 시 아래 구가 한 번 더 있는 주소
// (전체의 11%)에서 세 번째 칸이 "팔달구" 가 되어 동 필터가 깨졌다.
//
// 규칙
//   세종특별자치시  시군구 없음 → 두 번째 토큰이 동
//   "○○시 ○○구"    두 토큰을 합쳐 시군구, 세 번째가 동
//   그 외           두 번째가 시군구, 세 번째가 동
//
// 동 자리가 동/읍/면/리/가 로 끝나지 않으면(지번 없이 도로명만 있는 소수 사례) 비운다.
// 드롭다운에 "서방로159번길" 이 끼는 것보다 없는 편이 낫다.

const DONG_SUFFIX = /[동읍면리가]$/;

export function parseRegion(address) {
  const t = String(address ?? '').trim().split(/\s+/).filter(Boolean);
  const sido = t[0] ?? '';

  if (sido === '세종특별자치시') {
    const dong = t[1] ?? '';
    return { sido, sigungu: '', dong: DONG_SUFFIX.test(dong) ? dong : '' };
  }

  const twoLevel = t[1]?.endsWith('시') && t[2]?.endsWith('구');
  const sigungu = twoLevel ? `${t[1]} ${t[2]}` : (t[1] ?? '');
  const dong = (twoLevel ? t[3] : t[2]) ?? '';

  return { sido, sigungu, dong: DONG_SUFFIX.test(dong) ? dong : '' };
}
