// 눈으로 못 잡는 규칙들만 확인한다. 프레임워크 없이 node 로 바로 돈다.
//
//   node scripts/selftest.mjs
//
// 여기 있는 것들은 전부 "틀려도 화면은 멀쩡해 보이는" 종류다.
// 주소 파싱이 한 칸 밀리거나, 자정을 넘긴 영업시간을 닫힌 걸로 보거나,
// 표본 20 짜리 평점이 표본 5,000 짜리를 제치는 식이다.
//
// 타입은 Node 24 가 그대로 벗겨 읽는다(별도 빌드 불필요).

import assert from 'node:assert/strict';
import { parseRegion } from './lib/region.mjs';
import { parseNaver, parseKakao } from '../shared/parse-place.mjs';

// src/lib 의 .ts 를 그대로 읽는다. Node 22.18+ 부터 타입을 벗겨 실행한다.
// 그보다 낮으면 ERR_UNKNOWN_FILE_EXTENSION 만 뜨고 원인이 안 보인다.
//
// import 선언은 끌어올려지므로 정적 import 로 두면 이 검사보다 먼저 실행된다.
// 그래서 .ts 만 동적으로 불러온다.
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  console.error(
    `Node ${process.versions.node} 에서는 이 검사를 돌릴 수 없습니다.
` +
    '  .ts 를 직접 읽으므로 Node 22.18 이상이 필요합니다 (개발·CI 기준은 24).',
  );
  process.exit(1);
}

const { openStatus, isOpenNow, todayIndex } = await import('../src/lib/hours.ts');
const { summarize, computeMeans, formatCount, formatPrice } = await import('../src/lib/rating.ts');
const { parseQuery, toChoseong, isChoseongQuery, buildIndex, searchPlaces } = await import('../src/lib/search.ts');
const { readUrl, toSearch } = await import('../src/lib/url-state.ts');
const { groupOf, colorOf } = await import('../src/lib/categories.ts');

let passed = 0;
const it = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
};

// ---------- 주소 → 행정구역 ----------
it('시 아래 구가 한 번 더 있는 주소에서 동이 밀리지 않는다', () => {
  assert.deepEqual(parseRegion('경기도 수원시 팔달구 신풍동 83-2 건물 전체'), {
    sido: '경기도', sigungu: '수원시 팔달구', dong: '신풍동',
  });
  assert.deepEqual(parseRegion('경기도 고양시 일산동구 장항동 750'), {
    sido: '경기도', sigungu: '고양시 일산동구', dong: '장항동',
  });
});

it('일반 2단 주소', () => {
  assert.deepEqual(parseRegion('서울특별시 강남구 역삼동 619-30'), {
    sido: '서울특별시', sigungu: '강남구', dong: '역삼동',
  });
});

it('세종은 시군구가 없다', () => {
  assert.deepEqual(parseRegion('세종특별자치시 나성동 829'), {
    sido: '세종특별자치시', sigungu: '', dong: '나성동',
  });
});

it('읍·면·가도 동 자리로 인정한다', () => {
  assert.equal(parseRegion('충청남도 아산시 배방읍 북수리 1').dong, '배방읍');
  assert.equal(parseRegion('경기도 수원시 팔달구 팔달로3가 29-2').dong, '팔달로3가');
});

it('지번 없이 도로명만 있으면 동을 비운다', () => {
  // 드롭다운에 "서방로159번길" 이 끼는 것보다 없는 편이 낫다.
  assert.equal(parseRegion('광주광역시 북구 서방로159번길 47').dong, '');
});

// ---------- 영업시간 ----------
const at = (h, m = 0) => new Date(2026, 0, 1, h, m);

it('영업 중과 마감 임박을 나눈다', () => {
  const hours = ['11:00 ~ 22:00', '', '', '', '', '', ''];
  assert.equal(openStatus(hours, at(15)).state, 'open');
  assert.equal(openStatus(hours, at(21, 30)).state, 'closing-soon');
  assert.equal(openStatus(hours, at(23)).state, 'closed');
  assert.equal(openStatus(hours, at(9)).state, 'closed');
});

it('자정을 넘긴 영업을 닫힌 걸로 보지 않는다', () => {
  // 18:00 ~ 02:00 인 가게를 새벽 1시에 보면 열려 있어야 한다.
  const hours = ['18:00 ~ 02:00', '', '', '', '', '', ''];
  assert.equal(openStatus(hours, at(23)).state, 'open');
  assert.equal(isOpenNow(hours, at(1)), true);
});

it('수집한 요일과 보는 요일이 다르면 칸을 민다', () => {
  // 카카오 배열은 "수집한 날부터 7일" 이다. 화요일(2)에 받은 배열을 금요일(5)에 보면
  // 세 칸 뒤(인덱스 3)가 그날이다. 이걸 안 밀면 금요일에 화요일 영업시간을 적용한다.
  const hours = ['00:00 ~ 01:00', '', '', '11:00 ~ 22:00', '', '', ''];
  const friday = new Date(2026, 0, 2, 15); // 2026-01-02 는 금요일
  assert.equal(friday.getDay(), 5);
  assert.equal(openStatus(hours, friday, 2).state, 'open');   // 인덱스 3 = 11:00~22:00
  assert.equal(openStatus(hours, friday, 5).state, 'closed'); // 인덱스 0 = 00:00~01:00
  assert.equal(todayIndex(2, friday), 3);
  assert.equal(todayIndex(undefined, friday), 0); // 모르면 예전대로 0 번
});

it('오늘이 빈 문자열이면 휴무', () => {
  assert.equal(openStatus(['', '11:00 ~ 22:00'], at(15)).state, 'dayoff');
});

it('영업시간이 없으면 모른다고 한다', () => {
  assert.equal(openStatus(undefined, at(15)).state, 'unknown');
  assert.equal(isOpenNow(undefined, at(15)), false);
});

// ---------- 통합 평점 ----------
const means = { naver: 4.3, kakao: 3.9, google: 4.2 };

it('표본이 작은 소스는 순위를 흔들지 못한다', () => {
  const big = summarize({ naver: { score: 4.5, visitors: 5000, blogs: 0 } }, means);
  const tiny = summarize({ kakao: { score: 5.0, count: 3, blogs: 0 } }, means);
  // 리뷰 3개짜리 5.0 이 리뷰 5,000개짜리 4.5 보다 위로 오면 안 된다.
  assert.ok(big.combined > tiny.combined, `${big.combined} > ${tiny.combined}`);
});

it('소스가 하나뿐이면 신뢰도가 낮다', () => {
  const one = summarize({ naver: { score: 4.5, visitors: 5000, blogs: 0 } }, means);
  assert.equal(one.sourceCount, 1);
  assert.equal(one.confidence, 'low');
});

it('소스 둘에 표본이 충분하면 신뢰도가 높다', () => {
  const two = summarize(
    { naver: { score: 4.5, visitors: 900, blogs: 0 }, kakao: { score: 4.2, count: 120, blogs: 0 } },
    means,
  );
  assert.equal(two.confidence, 'high');
  assert.equal(two.sourceCount, 2);
});

it('소스 간 차이가 크면 경고한다', () => {
  const split = summarize(
    { naver: { score: 4.8, visitors: 900, blogs: 0 }, kakao: { score: 3.2, count: 400, blogs: 0 } },
    means,
  );
  assert.equal(split.caution, '소스마다 평가가 갈립니다');
});

it('표본 0 인 소스는 통합 점수에 끼지 않는다', () => {
  // n=0 이면 보정식이 (0·score + 50·4.3)/50 = 4.3 을 내놓는다.
  // 실제 2.0 짜리가 평점순 위로 올라가고 "평점 4.0+" 도 통과하게 된다.
  const zero = summarize({ naver: { score: 2.0, visitors: 0, blogs: 0 } }, means);
  assert.equal(zero.combined, null);
  assert.equal(zero.sourceCount, 0);
});

it('점수가 없으면 통합도 없다', () => {
  const none = summarize({ naver: { score: null, visitors: 120, blogs: 4 } }, means);
  assert.equal(none.combined, null);
  assert.equal(none.sourceCount, 0);
});

it('소스별 평균을 데이터에서 구한다', () => {
  const m = computeMeans({
    a: { naver: { score: 4.0, visitors: 10, blogs: 0 } },
    b: { naver: { score: 5.0, visitors: 10, blogs: 0 } },
  });
  assert.equal(m.naver, 4.5);
});

it('수와 가격 표기', () => {
  assert.equal(formatCount(1117), '1,117');
  assert.equal(formatCount(29000), '2.9만');
  assert.equal(formatPrice(3), '₩₩₩');
  assert.equal(formatPrice(undefined), null);
});

// ---------- 검색 ----------
it('질의에서 카테고리를 떼어 낸다', () => {
  assert.deepEqual(parseQuery('강남역 일식'), { categories: ['일식'], text: '강남역' });
  // 같은 분류를 두 번 쳐도 두 번째가 자유 검색어로 새면 안 된다.
  assert.deepEqual(parseQuery('일식 일식'), { categories: ['일식'], text: '' });
  assert.deepEqual(parseQuery('성수동 커피'), { categories: ['카페'], text: '성수동' });
  assert.deepEqual(parseQuery('자매수산'), { categories: [], text: '자매수산' });
});

it('초성 검색', () => {
  assert.equal(toChoseong('김밥천국'), 'ㄱㅂㅊㄱ');
  assert.equal(isChoseongQuery('ㄱㅂ'), true);
  assert.equal(isChoseongQuery('김밥'), false);
  assert.equal(isChoseongQuery('ㄱ'), false); // 한 글자는 너무 넓다
});

const places = [
  { placeId: '1', name: '백나예김밥', mcidName: '김밥', address: '경기도 성남시 분당구 서현동 255-2', dong: '서현동', category: '분식' },
  { placeId: '2', name: '맛짱분식', mcidName: '종합분식', address: '경기도 성남시 분당구 서현동 248-4', dong: '서현동', category: '분식' },
  { placeId: '3', name: '자매수산', mcidName: '회', address: '서울특별시 강남구 역삼동 619-30', dong: '역삼동', category: '해산물' },
];

it('이름·세분류·동으로 찾고 이름 접두가 위로 온다', () => {
  const idx = buildIndex(places);
  assert.deepEqual(searchPlaces(idx, '김밥').map((p) => p.placeId), ['1']);
  assert.deepEqual(searchPlaces(idx, '분식').map((p) => p.placeId), ['2']);
  assert.equal(searchPlaces(idx, '역삼동')[0].placeId, '3');
  assert.deepEqual(searchPlaces(idx, '없는가게'), []);
});

it('초성으로도 찾는다', () => {
  const idx = buildIndex(places);
  assert.equal(searchPlaces(idx, 'ㅈㅁㅅㅅ')[0].placeId, '3');
});

// ---------- URL 상태 ----------
it('URL 을 왕복해도 상태가 그대로다', () => {
  const state = {
    near: '강남역', ll: { lat: 37.497942, lng: 127.027621 }, r: 500,
    cat: ['일식', '중식'], q: '우동', sort: 'rating', open: true, min: 4,
    place: '1865051065', all: true, discover: true,
  };
  const back = readUrl(toSearch(state));
  assert.equal(back.near, '강남역');
  assert.equal(back.r, 500);
  assert.deepEqual(back.cat, ['일식', '중식']);
  assert.equal(back.sort, 'rating');
  assert.equal(back.open, true);
  assert.equal(back.min, 4);
  assert.equal(back.place, '1865051065');
  assert.equal(back.all, true);
  assert.equal(back.discover, true);
  assert.ok(Math.abs(back.ll.lat - 37.497942) < 1e-6);
  assert.ok(Math.abs(back.ll.lng - 127.027621) < 1e-6);
});

it('빈 상태는 빈 쿼리', () => {
  assert.equal(readUrl('').near, undefined);
  assert.equal(readUrl('?sort=엉뚱한값').sort, undefined);
});

// ---------- 카테고리 색군 ----------
it('14 종이 모두 색군을 갖는다', () => {
  const cats = ['한식','술집','카페','구이','양식','디저트','일식','중식','국물','해산물','분식','면','기타','아시아'];
  for (const c of cats) assert.ok(/^#[0-9A-Fa-f]{6}$/.test(colorOf(c)), c);
  assert.equal(groupOf('일식').key, 'sea');
  assert.equal(groupOf('구이').key, 'meat');
  assert.equal(groupOf('없는분류').key, 'other');
});

// ---------- 평점 파서 ----------
it('네이버: 점수와 키워드 리뷰를 집는다', () => {
  const html =
    '{"PlaceDetailBase:123":{"visitorReviewsTotal":1117,"visitorReviewsScore":4.53,"cafeBlogReviewsTotal":173}}' +
    '{"__typename":"VisitorReviewStatsAnalysisVoteKeywordDetail","code":"food_good","displayName":"음식이 맛있어요","count":987}' +
    '{"__typename":"VisitorReviewStatsAnalysisVoteKeywordDetail","code":"fresh","displayName":"재료가 신선해요","count":588}';
  const r = parseNaver(html, '123');
  assert.equal(r.score, 4.53);
  assert.equal(r.visitors, 1117);
  assert.equal(r.blogs, 173);
  assert.deepEqual(r.keywords[0], { t: '음식이 맛있어요', n: 987 });
});

it('네이버: 0 점은 점수 없음으로 다룬다', () => {
  // 방문자 리뷰가 288 개인데 평균이 정확히 0 인 가게가 실측 55 건. 실제 평점이 아니라 미제공이다.
  const html = '{"PlaceDetailBase:123":{"visitorReviewsTotal":288,"visitorReviewsScore":0,"cafeBlogReviewsTotal":267}}';
  const r = parseNaver(html, '123');
  assert.equal(r.score, null);
  assert.equal(r.visitors, 288);
});

it('네이버: 다른 장소의 점수를 집지 않는다', () => {
  // 주변 추천 블록에 다른 업체 값이 같이 실린다. 앵커 밖의 값을 쓰면 안 된다.
  const html =
    '{"PlaceDetailBase:999":{"visitorReviewsTotal":10,"visitorReviewsScore":1.1}}' +
    '{"PlaceDetailBase:123":{"visitorReviewsTotal":1117,"visitorReviewsScore":4.53}}';
  assert.equal(parseNaver(html, '123').score, 4.53);
});

it('네이버: 사라진 장소는 폐업으로 분류한다', () => {
  // placeDetail 이 null 인 페이지가 HTTP 200 으로 온다. 파싱 실패로 세면 게이트가 오작동한다.
  const html = '__APOLLO_STATE__ = {"ROOT_QUERY":{"placeDetail({\\"input\\":{\\"id\\":\\"123\\"}})":null}}';
  assert.deepEqual(parseNaver(html, '123'), { gone: true });
});

it('카카오: 점수·가격·영업시간·랭킹을 집는다', () => {
  const r = parseKakao({
    kakaomap_review: { score_set: { average_score: 3, review_count: 49 } },
    blog_review: { review_count: 370 },
    ai_mate: { price_level: { symbol: '₩₩₩₩' } },
    summary: { status: 'Y', name: '자매수산', regions: [{ depth: 1, name: '서울' }, { depth: 2, name: '강남구' }] },
    open_hours: { week_from_today: { week_periods: [{ days: [{ on_days: { start_end_time_desc: '14:00 ~ 24:00' } }, {}] }] } },
    menu: { menus: { items: [{ name: '대광어회', price: 55000 }] } },
    trend_rank: { show_ranking_card: true, display_text: '강남구 회 인기 맛집', menu_rank: { rank: 5 } },
    photos: { counts: { total: 1261 } },
  });
  assert.equal(r.score, 3);
  assert.equal(r.count, 49);
  assert.equal(r.blogs, 370);
  assert.equal(r.price, 4);
  assert.deepEqual(r.hours, ['14:00 ~ 24:00', '']);
  assert.deepEqual(r.menus, [{ name: '대광어회', price: 55000 }]);
  assert.equal(r.rank.n, 5);
  assert.equal(r.closed, undefined);
});

it('카카오: 영업상태가 Y 가 아니면 폐업 표시', () => {
  assert.equal(parseKakao({ summary: { status: 'C' } }).closed, true);
});

console.log(`${passed}개 통과${process.exitCode ? ' · 실패 있음' : ''}`);
