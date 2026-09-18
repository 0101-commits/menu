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

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 네이버 영업시간. `newBusinessHours[0].businessHours` 가 오늘부터 7일치로 온다.
 *
 * 카카오와 **같은 형식**(문자열 7개 + 기준 요일)으로 맞춘다. 화면은 어느 소스에서 왔는지
 * 몰라도 되게 하는 편이 낫다 — 카카오에 안 붙은 가게가 851곳이고, 그 자리를 이걸로 메운다.
 *
 * 요일 이름이 값 안에 들어 있어 기준 요일을 따로 추측할 필요가 없다("목(9/24)" 처럼
 * 날짜가 붙기도 해서 첫 글자만 본다). 영업하지 않는 날은 빈 문자열이다 — 카카오 규약과 같다.
 */
function parseNaverHours(html) {
  const anchor = html.indexOf('"businessHours":[{"__typename":"WorkingHoursInfo"');
  if (anchor < 0) return null;

  const win = html.slice(anchor, anchor + 6000);
  const days = win.split('{"__typename":"WorkingHoursInfo"').slice(1, 8);
  if (!days.length) return null;

  const hours = [];
  let baseDay = null;

  for (const seg of days) {
    const dayName = (seg.match(/"day":"(.)/) ?? [])[1];
    if (baseDay === null && dayName) {
      const i = DAY_NAMES.indexOf(dayName);
      if (i >= 0) baseDay = i;
    }

    const span = seg.match(/"businessHours":\{"__typename":"StartEndTime","start":"([^"]*)","end":"([^"]*)"/);
    if (!span) { hours.push(''); continue; }

    // 브레이크 타임이 있으면 같이 적는다. 없는 가게가 대부분이라 있을 때만 붙인다.
    const brk = seg.match(/"breakHours":\[\{"__typename":"StartEndTime","start":"([^"]*)","end":"([^"]*)"/);
    hours.push(brk ? `${span[1]}~${span[2]} (브레이크 ${brk[1]}~${brk[2]})` : `${span[1]}~${span[2]}`);
  }

  if (baseDay === null || !hours.some((h) => h)) return null;
  return { hours, hoursDay: baseDay };
}

/**
 * 네이버 대표 메뉴. 가격은 "5,500원" 같은 표시 문자열로 와서 숫자만 뽑는다.
 * badges 에 "repr" 이 붙은 것이 업주가 고른 대표 메뉴다. 없으면 앞에서 채운다.
 */
function parseNaverMenus(html) {
  const items = [];
  for (const seg of html.split('"__typename":"PlaceMenuItem"').slice(1)) {
    const head = seg.slice(0, 900);
    const name = (head.match(/"name":"([^"]+)"/) ?? [])[1];
    if (!name) continue;
    const priceText = (head.match(/"displayText":"([^"]*)"/) ?? [])[1] ?? '';
    const digits = priceText.replace(/[^\d]/g, '');
    items.push({
      name,
      ...(digits ? { price: Number(digits) } : {}),
      repr: /"badges":\[[^\]]*"repr"/.test(head),
    });
  }
  if (!items.length) return null;

  const repr = items.filter((m) => m.repr);
  return (repr.length ? repr : items).slice(0, 3).map(({ name, price }) => ({
    name,
    ...(price ? { price } : {}),
  }));
}

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

  // 네이버는 점수를 내려주면서도 "이건 노출하지 말라" 는 플래그를 같이 준다(ReviewSettings).
  // 실측 표본 18곳 중 12곳이 false 였다. 값 자체는 현재값이고 계속 갱신된다 —
  // 그래서 버리지 않고, 어떤 상태인지 기록해 화면에서 판단할 수 있게 한다.
  const showFlag = html.match(/"showVisitorReviewScore":(true|false)/);
  const scoreHidden = showFlag ? showFlag[1] === 'false' : undefined;

  // 앵커도 못 찾고 점수 필드도 없으면 파싱이 어긋난 것이다. 0 점으로 저장하면 안 된다.
  if (anchor < 0 && score === undefined && visitors === undefined) return { parseError: true };

  // 영업시간·메뉴는 같은 HTML 에 이미 들어 있다. 추가 호출이 0 이므로 항상 뽑는다.
  const hours = parseNaverHours(html);
  const menus = parseNaverMenus(html);

  return {
    ...(hours ? hours : {}),
    ...(menus ? { menus } : {}),
    // 0 은 실제 평점이 아니라 "점수 없음" 이다. 방문자 리뷰가 288 개인데 평균이 정확히 0 인
    // 가게가 실측 55 건 나왔고, 0 초과 3 미만은 6 건뿐이었다. 0.0 으로 보여 주면
    // 평점순 바닥에 깔리고 카드에는 거짓말이 찍힌다.
    score: score ? score : null,
    visitors: visitors ?? 0,
    blogs: blogs ?? 0,
    ...(scoreHidden ? { scoreHidden: true } : {}),
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
  const rawHours = days.map((d) => d?.on_days?.start_end_time_desc ?? '');
  // 칸이 전부 비어 있으면 "매일 휴무" 가 아니라 시간 정보가 없는 것이다.
  // 그대로 두면 화면에 "오늘 휴무" 로 뜬다. 실측 17건 중 3건이 이랬다.
  const hours = rawHours.some((h) => h.trim()) ? rawHours : undefined;

  const menus = (j?.menu?.menus?.items ?? [])
    .slice(0, 3)
    .map((m) => ({ name: m.name, price: m.price }))
    .filter((m) => m.name);

  return {
    // 네이버와 같은 이유로 0 은 점수 없음이다(별점 표본 0 이면 평균도 0 으로 온다).
    score: ss.average_score ? ss.average_score : null,
    count: ss.review_count ?? 0,
    blogs: j?.blog_review?.review_count ?? 0,
    ...(sym ? { price: sym.length } : {}), // ₩₩₩₩ → 4
    ...(hours ? { hours } : {}),
    ...(menus.length ? { menus } : {}),
    // show_ranking_card 만 보고 만들면 문구도 순위도 없는 빈 rank 가 남아 화면에 글자 없는
    // 알약이 찍힌다. 보여 줄 말이 하나라도 있을 때만 만든다.
    ...(j?.trend_rank?.show_ranking_card &&
    (j.trend_rank.display_text?.trim() || j.trend_rank.menu_rank?.rank)
      ? {
          rank: {
            text: j.trend_rank.display_text?.trim() ?? '',
            ...(j.trend_rank.menu_rank?.rank ? { n: j.trend_rank.menu_rank.rank } : {}),
          },
        }
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
