// 어느 후보를 같은 가게로 볼 것인가.
//
// 매칭에서 가장 위험한 건 오매칭이다 — 다른 가게의 평점이 조용히 붙는다.
// 그래서 이 판정만 따로 떼어 두고 scripts/selftest.mjs 가 실제 사례로 검사한다.

/**
 * 비교용으로 이름을 다듬는다. 괄호·기호·공백을 걷고 소문자로.
 *
 * 지점 표기는 **여기서 떼지 않는다.** 예전에는 `[가-힣A-Za-z]{1,10}점$` 으로 떼었는데
 * 그 패턴이 짧은 이름을 통째로 먹었다 — "보슬보슬역삼본점" → "", "또보겠지떡볶이해피토스점" → "또".
 * 빈 문자열은 어떤 후보와도 안 맞으니 매칭이 조용히 실패했다.
 * 지점 차이는 judge() 의 공통 접두 판정이 자연스럽게 흡수한다.
 */
export function norm(name) {
  return String(name ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[\s·・.,'"`~!@#$%^&*_+=|\\/-]/g, '')
    .toLowerCase();
}

/**
 * 정규화한 두 이름의 공통 접두 길이.
 *
 * "같아야 한다" 로는 구글을 못 잡는다. 구글의 한국 등록명에는 외국어·업종어가 덧붙는다
 * (덕복희집 → "덕복희집 The Oriental Bistro DeokBoKi", 기태만두 → "기태만두Gitae饺子").
 * 우리 쪽에도 "효자촌서현점" 같은 군더더기가 붙으므로 포함 관계로도 안 잡힌다.
 * 둘 다 상호로 시작하므로 앞에서부터 얼마나 겹치는지가 가장 곧은 신호다.
 */
export function commonPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/**
 * 이름과 거리로 채택 여부를 정한다. 거리가 짧을수록 이름을 느슨하게 본다.
 * 가까울수록 다른 가게일 가능성이 급격히 줄기 때문이다.
 */
export function judge(place, candName, dist) {
  const a = norm(place.name);
  const b = norm(candName);
  if (!a || !b) return null;

  const lcp = commonPrefix(a, b);
  // 한쪽이 다른 쪽으로 시작하면(= 접두) 같은 상호에 군더더기가 붙은 것이다.
  //   "백나예김밥" ⊂ "백나예김밥효자촌서현점", "코야코" ⊂ "코야코떡볶이"
  const prefix = lcp >= 3 && lcp === Math.min(a.length, b.length);

  if (a === b || prefix) {
    if (dist <= 80) return 'high';
    if (dist <= 300) return 'medium';
    return null;
  }

  // 둘 다 서로 다른 꼬리를 가진 경우. "스타벅스강남점" vs "스타벅스역삼점" 이 여기 걸린다 —
  // 같은 상호의 다른 지점일 수 있으므로 아주 가까울 때만 인정한다.
  if (lcp >= 3 && dist <= 25) return 'medium';
  return null;
}

// ---------- 붙은 매칭이 맞는지 되재는 쪽 ----------
// 위는 "붙일까" 를 정하고, 아래는 이미 붙은 것을 표본으로 "맞나" 를 되잰다.
// scripts/google-verify-match.mjs 의 게이트가 이 판정을 쓴다.

/** 두 지점 사이 미터. 지구를 구로 본다(하버사인) — 수백 미터 규모에서는 오차가 무의미하다. */
export function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 이름이 같은 가게를 가리키는가. judge() 와 달리 거리를 안 본다 — 거리는 따로 센다.
 *
 * 구글 한국 등록명에는 외국어·업종어가 덧붙고("기태만두Gitae饺子") 우리 쪽에는 지점명이
 * 붙는다("백나예김밥 효자촌서현점"). 완전 일치를 요구하면 멀쩡한 매칭이 전부 떨어진다.
 */
export function nameMatch(ours, theirs) {
  const a = norm(ours);
  const b = norm(theirs);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // 앞에서 3글자 이상 겹치고 그게 짧은 쪽의 절반을 넘으면 같은 상호로 본다.
  const lcp = commonPrefix(a, b);
  return lcp >= 3 && lcp >= Math.min(a.length, b.length) / 2;
}

/** 이름·좌표 둘 다 맞으면 ok, 하나만 맞으면 suspect(사람이 본다), 둘 다 아니면 mismatch. */
export function verifyVerdict(nameOk, dist, nearM = 150) {
  const nearOk = typeof dist === 'number' && dist <= nearM;
  if (nameOk && nearOk) return 'ok';
  if (!nameOk && !nearOk) return 'mismatch';
  return 'suspect';
}
