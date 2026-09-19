// 저장된 맛집의 평점·영업정보를 네이버·카카오에서 수집해 raw/ratings.json 에 쌓는다.
//
// 왜 두 소스인가: 공식 검색 API(네이버 지역검색·카카오 로컬)에는 평점 필드가 없다.
// 실측 결과 평점이 나오는 경로는 아래 둘뿐이다. 스펙과 실측 기록은 docs/ratings-api.md.
//
//   네이버  m.place.naver.com/restaurant/{sid}/home  → visitorReviewsScore / visitorReviewsTotal
//   카카오  place-api.map.kakao.com/places/panel3/{id} → kakaomap_review.score_set
//
// 둘 다 인증이 필요 없지만 비공식 경로다. 조용히 실패하지 않도록 실패율을 리포트로 남기고,
// 게이트(build-ratings.mjs)가 그 값을 검사한다.
//
// 재개 가능하다. 중간에 끊겨도 이미 받은 건 raw/ratings.json 에 남고 다시 돌리면 이어서 받는다.
//
// 사용:
//   node scripts/ratings.mjs                      전체, 양쪽 소스
//   node scripts/ratings.mjs --source=naver       네이버만 (카카오는 kakaoId 매칭 후에 가능)
//   node scripts/ratings.mjs --limit=100          앞에서 100건만
//   node scripts/ratings.mjs --shard=1/4          4등분 중 1번째 (CI 주간 롤링용)
//   node scripts/ratings.mjs --refresh=30         30일보다 오래된 것도 다시 받기
//   node scripts/ratings.mjs --force              --refresh 무시하고 전량 재수집
//   node scripts/ratings.mjs --missing=hours      영업시간이 비어 있는 곳만 (재수집 주기 무시)

import fs from 'node:fs';
import { readPlaces, readJson, writeJson, sleep, args } from './lib/places-io.mjs';
import { fetchNaver, fetchKakao } from '../shared/parse-place.mjs';

const OUT = 'raw/ratings.json';
const A = args();
const SOURCE = A.source ?? 'both';
// 소스마다 견디는 간격이 다르다. 카카오는 공식 API 에 가까워 700ms 로도 안 막히지만
// 네이버는 비공식 경로라 1.1초 밑으로 내리면 400/429 가 쏟아진다. --delay 를 주면 그 값이 이긴다.
const DEFAULT_DELAY = SOURCE === 'kakao' ? 700 : 1100;
const DELAY = Number(A.delay ?? DEFAULT_DELAY);
const MAX_RETRY = 4;
const REFRESH_DAYS = A.force ? 0 : Number(A.refresh ?? 30);

// 파서와 호출은 shared/parse-place.mjs 한 곳에 있다. Worker 도 같은 것을 쓴다.
// 여기서는 타임아웃만 얹는다 — 네이버 페이지가 600KB 라 가끔 오래 끈다.
const withTimeout = (ms) => (url, init) =>
  fetch(url, { ...init, signal: AbortSignal.timeout(ms) });

const getNaver = (sid) => fetchNaver(sid, withTimeout(30000));
const getKakao = (id) => fetchKakao(id, withTimeout(30000));

async function withRetry(fn, label) {
  for (let i = 0; i < MAX_RETRY; i++) {
    try {
      return await fn();
    } catch (e) {
      const rate = String(e).includes('RATE_LIMIT');
      if (i === MAX_RETRY - 1) return { error: String(e.message ?? e) };
      const wait = rate ? 30000 * (i + 1) : 1500 * (i + 1);
      if (rate) console.log(`    레이트리밋(${label}) — ${wait / 1000}초 대기`);
      await sleep(wait);
    }
  }
}

// ---------- 실행 ----------

const places = readPlaces();
const store = readJson(OUT, {});

const cutoff = Date.now() - REFRESH_DAYS * 86400000;
const isFresh = (entry) => entry?.at && Date.parse(entry.at) > cutoff;

// 실패로 남은 것만 다시 받는다. 파서를 고친 뒤 재분류할 때 쓴다.
const failed = (e) => Boolean(e?.error || e?.parseError);

// 특정 필드가 빈 곳만 고른다. 전량 재수집이 현실적이지 않을 때 쓴다 —
// 네이버는 레이트리밋 때문에 4,084곳이 14시간이 걸린다(실측: 30초 백오프가 전체의 92%).
// 판단 기준은 이미 내보낸 public/data/ratings.json 이다. 그게 지금 화면에 보이는 상태다.
const MISSING = A.missing;
const published = MISSING ? readJson('public/data/ratings.json', {}) : {};
const lacks = (sid) => {
  const e = published[sid];
  if (MISSING === 'hours') return !e?.hours?.length;
  if (MISSING === 'menus') return !e?.menus?.length;
  if (MISSING === 'score') return !(e?.naver?.score ?? e?.kakao?.score);
  throw new Error(`--missing 값이 이상합니다: ${MISSING} (hours | menus | score)`);
};

let targets = places.filter((p) => {
  const cur = store[p.placeId];
  if (A['retry-failed']) return failed(cur?.naver) || (p.kakaoId && failed(cur?.kakao));
  // --missing 은 재수집 주기를 보지 않는다. 주기로 거르면 이미 받아 둔(그러나 그 필드가 빈)
  // 곳이 전부 걸러져 대상이 0건이 된다.
  if (MISSING) return lacks(p.placeId);
  const needNaver = SOURCE !== 'kakao' && !isFresh(cur?.naver);
  const needKakao = SOURCE !== 'naver' && p.kakaoId && !isFresh(cur?.kakao);
  return needNaver || needKakao;
});

if (A.shard) {
  const [n, of] = String(A.shard).split('/').map(Number);
  targets = targets.filter((_, i) => i % of === n - 1);
  console.log(`샤드 ${n}/${of}`);
}
if (A.limit) targets = targets.slice(0, Number(A.limit));

const withKakaoId = places.filter((p) => p.kakaoId).length;
console.log(`장소 ${places.length}건 (kakaoId 보유 ${withKakaoId}건) · 이미 받은 것 ${Object.keys(store).length}건`);
console.log(`대상 ${targets.length}건${MISSING ? ` (${MISSING} 결측분만)` : ''} · 소스 ${SOURCE} · 간격 ${DELAY}ms · 예상 ${Math.ceil((targets.length * DELAY) / 60000)}분`);

const stat = { naverOk: 0, naverNull: 0, naverErr: 0, kakaoOk: 0, kakaoErr: 0, gone: 0, parseErr: 0 };
let done = 0;

const flush = () => writeJson(OUT, store);

for (const p of targets) {
  const cur = (store[p.placeId] ??= { name: p.name });
  const now = new Date().toISOString();

  const wantNaver = MISSING ? true : A['retry-failed'] ? failed(cur.naver) : !isFresh(cur.naver);
  const wantKakao = MISSING ? true : A['retry-failed'] ? failed(cur.kakao) : !isFresh(cur.kakao);

  if (SOURCE !== 'kakao' && wantNaver) {
    const r = await withRetry(() => getNaver(p.placeId), 'naver');
    if (r.error) stat.naverErr++;
    else if (r.gone) stat.gone++;
    else if (r.parseError) stat.parseErr++;
    else if (r.score === null) stat.naverNull++;
    else stat.naverOk++;
    cur.naver = { ...r, at: now };
  }

  if (SOURCE !== 'naver' && p.kakaoId && wantKakao) {
    if (SOURCE === 'both') await sleep(300);
    const r = await withRetry(() => getKakao(p.kakaoId), 'kakao');
    if (r.error) stat.kakaoErr++;
    else stat.kakaoOk++;
    cur.kakao = { ...r, at: now };
  }

  if (++done % 25 === 0) {
    flush();
    const pct = ((done / targets.length) * 100).toFixed(1);
    console.log(
      `  ${done}/${targets.length} (${pct}%) · 네이버 점수 ${stat.naverOk} / 점수없음 ${stat.naverNull} / 실패 ${stat.naverErr} · 카카오 ${stat.kakaoOk}/${stat.kakaoErr} · 폐업 ${stat.gone}`,
    );
  }
  await sleep(DELAY);
}

flush();
console.log(`\n완료 → ${OUT}`);
console.log(JSON.stringify(stat));

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(
  `reports/ratings-${new Date().toISOString().slice(0, 10)}.json`,
  JSON.stringify({ at: new Date().toISOString(), source: SOURCE, targets: targets.length, ...stat }, null, 2),
);
