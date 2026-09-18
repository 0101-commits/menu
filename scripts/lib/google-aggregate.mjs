// 구글 원장(raw/google.json)을 앱이 한 번에 받아 쓸 수 있는 한 덩어리로 바꾼다.
//
// 원장은 구글 place ID 로 키를 잡지만 앱은 네이버 place ID 로 평점을 찾는다.
// 그 변환을 여기서 한 번에 하고, Worker 는 그 결과를 KV 키 하나(g:all)로 들고 있다가
// 그대로 돌려준다. 장소마다 KV 를 읽으면 목록 한 번에 3,613번 읽기가 된다.

/**
 * @param places  places.json (googlePlaceId 가 붙은 것만 쓴다)
 * @param ledger  raw/google.json — { [googlePlaceId]: { score, count, price?, gone?, at } }
 * @returns { [네이버 placeId]: { score, count, price? } }
 */
export function toAggregate(places, ledger) {
  const out = {};
  for (const p of places) {
    const v = p.googlePlaceId && ledger[p.googlePlaceId];
    if (!v) continue;
    // 사라진 장소는 뺀다. 남겨 두면 화면이 "평점 없는 가게" 로 그린다.
    if (v.gone) continue;
    // 점수가 null 인 곳은 남긴다. 받아는 봤다는 뜻이라, 화면이 "수집 전" 과 구분해 적을 수 있다.
    out[p.placeId] = {
      score: v.score ?? null,
      count: v.count ?? 0,
      ...(v.price ? { price: v.price } : {}),
    };
  }
  return out;
}
