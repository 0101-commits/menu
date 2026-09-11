// 네이버·카카오 플레이스에서 평점을 뽑는 한 벌.
//
// 두 곳에서 쓴다.
//   scripts/ratings.mjs   저장한 맛집 4,000 여 곳을 주기적으로 훑는다(빌드 타임)
//   worker/index.js       저장 안 한 가게를 그때그때 본다(런타임, CORS 우회 겸)
//
// 파서를 두 벌 두면 한쪽만 고치는 날이 온다. 비공식 경로라 바뀔 게 확실하므로
// 고칠 곳을 하나로 묶어 둔다. 실측 기록은 docs/ratings-api.md.

export const NAVER_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
export const KAKAO_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

// ---------- 네이버 ----------

export function parseNaver(html, sid) {
  // 즐겨찾기에는 남아 있지만 네이버 플레이스에서 사라진 장소가 있다.
  // 이때 페이지는 HTTP 200 으로 오고 Apollo 상태의 placeDetail 만 null 이다.
  // 파싱 실패로 세면 실패율 게이트가 엉뚱하게 울린다. 폐업으로 분류하는 게 맞다.
  if (/"placeDetail\(.{0,400}?\)":null/.test(html)) return { gone: true };

  // 점수는 PlaceDetailBase:{sid} 블록 안에서만 찾는다. 문서 전체를 훑으면
  // 주변 추천 등 다른 업체의 값을 집을 수 있다.
  const anchor = html.indexOf(`"PlaceDetailBase:${sid}"`);
  const win = anchor >= 0 ? html.slice(anchor, anchor + 4000) : html;

  const num = (re) => {
    const m = win.match(re);
    if (!m) return undefined;
    return m[1] === 'null' ? null : Number(m[1]);
  };

  const score = num(/"visitorReviewsScore":([\d.]+|null)/);
  const visitors = num(/"visitorReviewsTotal":(\d+|null)/);
  const blogs = num(/"cafeBlogReviewsTotal":(\d+|null)/);

  // 키워드 리뷰. 네이버가 별점 대신 내세우는 것으로 "음식이 맛있어요 3,758" 처럼 온다.
  //
  // keywordList 를 쓰면 안 된다. 그건 업주가 등록한 검색 키워드라 뜻이 다르고
  // ("수제버거혼밥치맥직장인단체회식" 같은 키워드 스터핑이 그대로 들어온다),
  // 문서 어디에나 있어서 다른 장소의 값을 집을 위험도 있다.
  const keywords = [];
  for (const seg of html.split('"VisitorReviewStatsAnalysisVoteKeywordDetail"').slice(1)) {
    const m = seg.slice(0, 600).match(/"displayName":"([^"]+)","count":(\d+)/);
    if (m) keywords.push({ t: m[1], n: Number(m[2]) });
  }
  keywords.sort((a, b) => b.n - a.n);

  const booking = (html.match(/"naverBookingUrl":"(https:[^"]+)"/) ?? [])[1];

  // 앵커도 못 찾고 점수 필드도 없으면 파싱이 어긋난 것이다. 0 점으로 저장하면 안 된다.
  if (anchor < 0 && score === undefined && visitors === undefined) return { parseError: true };

  return {
    score: score ?? null,
    visitors: visitors ?? 0,
    blogs: blogs ?? 0,
    ...(keywords.length ? { keywords: keywords.slice(0, 6) } : {}),
    ...(booking ? { booking } : {}),
  };
}

export async function fetchNaver(sid, fetchImpl = fetch) {
  const res = await fetchImpl(`https://m.place.naver.com/restaurant/${sid}/home`, {
    headers: { 'user-agent': NAVER_UA, 'accept-language': 'ko-KR,ko;q=0.9' },
  });
  if (res.status === 404) return { gone: true };
  // 400/403/429 는 전부 레이트리밋 신호로 다룬다. docs/myplace-api.md 실측 참고 —
  // 400 을 "없는 장소" 로 해석하면 데이터를 조용히 날린다.
  if (res.status === 400 || res.status === 403 || res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseNaver(await res.text(), sid);
}

// ---------- 카카오 ----------

export function parseKakao(j) {
  const ss = j?.kakaomap_review?.score_set ?? {};
  const sym = j?.ai_mate?.price_level?.symbol;
  const status = j?.summary?.status;
  const regions = (j?.summary?.regions ?? []).reduce((a, r) => ({ ...a, [r.depth]: r.name }), {});

  // 영업시간은 주 단위 표 전체가 크다. 요일별 "시작~끝" 문자열만 남긴다.
  const days = j?.open_hours?.week_from_today?.week_periods?.[0]?.days ?? [];
  const hours = days.length ? days.map((d) => d?.on_days?.start_end_time_desc ?? '') : undefined;

  const menus = (j?.menu?.menus?.items ?? [])
    .slice(0, 3)
    .map((m) => ({ name: m.name, price: m.price }))
    .filter((m) => m.name);

  return {
    score: ss.average_score ?? null,
    count: ss.review_count ?? 0,
    blogs: j?.blog_review?.review_count ?? 0,
    ...(sym ? { price: sym.length } : {}), // ₩₩₩₩ → 4
    ...(hours ? { hours } : {}),
    ...(menus.length ? { menus } : {}),
    ...(j?.trend_rank?.show_ranking_card
      ? { rank: { text: j.trend_rank.display_text, n: j.trend_rank.menu_rank?.rank } }
      : {}),
    ...(status && status !== 'Y' ? { closed: true } : {}),
    ...(regions[1] ? { region: [regions[1], regions[2], regions[3]].filter(Boolean) } : {}),
    photos: j?.photos?.counts?.total ?? 0,
    ...(j?.summary?.name ? { name: j.summary.name } : {}),
  };
}

export async function fetchKakao(id, fetchImpl = fetch) {
  const res = await fetchImpl(`https://place-api.map.kakao.com/places/panel3/${id}`, {
    headers: {
      'user-agent': KAKAO_UA,
      accept: 'application/json',
      pf: 'web', // 이 헤더가 없으면 404 가 온다
      origin: 'https://place.map.kakao.com',
      referer: 'https://place.map.kakao.com/',
    },
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 403 || res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseKakao(await res.json());
}

// ---------- 구글 ----------
// fieldMask 를 여기서 고정한다. reviews 를 넣는 순간 Enterprise + Atmosphere 로 올라가
// 1,000 건당 $25 가 된다. 넣지 않는다.
export const GOOGLE_FIELD_MASK = 'rating,userRatingCount,priceLevel,regularOpeningHours';

export async function fetchGoogle(placeId, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`, {
    headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': GOOGLE_FIELD_MASK },
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return {
    score: j.rating ?? null,
    count: j.userRatingCount ?? 0,
    // PRICE_LEVEL_INEXPENSIVE … 를 ₩ 개수로 바꾼다.
    ...(j.priceLevel ? { price: googlePrice(j.priceLevel) } : {}),
    ...(typeof j.regularOpeningHours?.openNow === 'boolean' ? { open: j.regularOpeningHours.openNow } : {}),
  };
}

function googlePrice(level) {
  const map = {
    PRICE_LEVEL_FREE: 1,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return map[level];
}
