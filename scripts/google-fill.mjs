// 구글 평점을 모아 Worker KV 에 넣을 파일을 만든다.
//
// 왜 따로 있나: 네이버·카카오와 달리 구글은 받은 값을 공개 레포에 둘 수 없다.
// 약관(Maps Platform Service Specific Terms §14.3)이 Places API 에서 캐시를 허용한 건
// 위경도뿐이고, place ID 만 영구 저장이 예외다. 평점·리뷰 수·가격대는 목록에 없다.
// 그래서 public/data/ratings.json 에는 절대 안 쓰고, 비공개인 Worker KV 로만 보낸다.
// 이 선택의 위험은 알고 감수한 것이다 — 판단 근거는 감사 문서에 적어 두었다.
//
// 돈이 드는 유일한 소스다. Place Details Enterprise SKU 는 월 1,000건 무료,
// 그 뒤로 1,000건당 $20 다(rating·userRatingCount·priceLevel 이 전부 이 등급 필드라
// 더 싼 등급으로 내려갈 방법이 없다).
//
// 사용:
//   node scripts/google-fill.mjs                  안 받은 것 중 1,000건 (무료 한도)
//   node scripts/google-fill.mjs --all --yes      전량. 유료 구간에 들어가므로 --yes 필수
//   node scripts/google-fill.mjs --older-than=90  90일 넘은 것도 갱신 대상에 넣는다
//   node scripts/google-fill.mjs --dry            계획과 비용만 찍고 안 부른다
//
// 끝나면 wrangler 명령을 찍어 준다. KV 에 올리는 건 그 한 줄이다.

import fs from 'node:fs';
import { readPlaces, readJson, writeJson, sleep, args } from './lib/places-io.mjs';
import { fetchGoogle } from '../shared/parse-place.mjs';
import { toAggregate } from './lib/google-aggregate.mjs';

const LEDGER = 'raw/google.json';
const BULK = 'raw/google-kv.json';

const A = args();
const KEY = process.env.GOOGLE_PLACES_KEY;
const LIMIT = A.all ? Infinity : Number(A.limit ?? 1000);
const OLDER_THAN = Number(A['older-than'] ?? 120);
const DELAY = Number(A.delay ?? 120);

// 무료 한도. 넘는 만큼이 요금이다.
const FREE_PER_MONTH = 1000;
const PRICE_PER_1000 = 20;

if (!KEY) {
  console.error(
    'GOOGLE_PLACES_KEY 가 없습니다.\n' +
      '  PowerShell:  $env:GOOGLE_PLACES_KEY = "..."\n' +
      '  bash:        export GOOGLE_PLACES_KEY=...',
  );
  process.exit(1);
}

const places = readPlaces().filter((p) => p.googlePlaceId);
const ledger = readJson(LEDGER, {});

const cutoff = Date.now() - OLDER_THAN * 86400000;
const ageOf = (gid) => {
  const at = ledger[gid]?.at;
  return at ? Date.parse(at) : 0; // 없으면 0 — 가장 먼저 받는다
};

// 안 받은 것이 먼저, 그다음 오래된 것부터. 이러면 매달 1,000건씩 돌려도
// 언젠가 전부 한 바퀴를 돈다(3,613곳 기준 약 4개월).
const stale = places.filter((p) => ageOf(p.googlePlaceId) < cutoff);
stale.sort((a, b) => ageOf(a.googlePlaceId) - ageOf(b.googlePlaceId));

const targets = stale.slice(0, LIMIT === Infinity ? stale.length : LIMIT);
const never = targets.filter((p) => !ledger[p.googlePlaceId]).length;
const billable = Math.max(0, targets.length - FREE_PER_MONTH);
const cost = (billable / 1000) * PRICE_PER_1000;

console.log(`구글 place ID 보유 ${places.length}곳 · 이미 받은 것 ${Object.keys(ledger).length}건`);
console.log(`갱신 대상 ${stale.length}건 (${OLDER_THAN}일 초과 또는 미수집) → 이번에 ${targets.length}건`);
console.log(`  처음 받는 곳 ${never}건 · 갱신 ${targets.length - never}건`);
console.log(
  `예상 비용: 무료 ${Math.min(targets.length, FREE_PER_MONTH)}건 + 과금 ${billable}건 = $${cost.toFixed(2)}`,
);

if (!targets.length) {
  console.log('\n받을 것이 없습니다.');
  process.exit(0);
}
if (billable > 0 && !A.yes) {
  console.error(
    `\n무료 한도(월 ${FREE_PER_MONTH}건)를 ${billable}건 넘습니다. 그래도 받으려면 --yes 를 붙이세요.`,
  );
  process.exit(1);
}
if (A.dry) {
  console.log('\n--dry 이므로 받지 않았습니다.');
  process.exit(0);
}

let ok = 0;
let gone = 0;
let err = 0;

for (const [i, p] of targets.entries()) {
  const gid = p.googlePlaceId;
  try {
    const r = await fetchGoogle(gid, KEY);
    if (r.gone) {
      // 장소가 사라졌다. 다시 묻지 않도록 표시만 남긴다 — 안 남기면 매달 같은 건에 돈을 쓴다.
      ledger[gid] = { gone: true, at: new Date().toISOString() };
      gone++;
    } else {
      ledger[gid] = { ...r, at: new Date().toISOString() };
      ok++;
    }
  } catch (e) {
    // 실패는 기록하지 않는다. at 이 안 찍히면 다음 실행이 다시 집는다.
    err++;
    if (String(e.message ?? e).includes('RATE_LIMIT')) await sleep(30000);
  }

  if ((i + 1) % 100 === 0) {
    writeJson(LEDGER, ledger);
    console.log(`  ${i + 1}/${targets.length} · 성공 ${ok} · 없어짐 ${gone} · 실패 ${err}`);
  }
  await sleep(DELAY);
}

writeJson(LEDGER, ledger);

// wrangler 가 읽는 대량 업로드 형식. 값에 TTL 을 주지 않는다 —
// 주면 30일 뒤 사라지고, 다시 채우는 데 매달 $52 가 든다.
//
// 두 가지를 같이 올린다.
//   g:{구글 place ID}  상세 화면이 한 곳을 열 때 쓴다
//   g:all              목록이 한 번에 받아 가는 덩어리. 네이버 place ID 로 키를 다시 잡는다.
//                      장소마다 KV 를 읽으면 목록 한 번에 3,613번 읽기가 되기 때문이다.
const aggregate = toAggregate(places, ledger);
const bulk = [
  ...Object.entries(ledger)
    .filter(([, v]) => !v.gone)
    .map(([gid, v]) => ({ key: `g:${gid}`, value: JSON.stringify(v) })),
  { key: 'g:all', value: JSON.stringify(aggregate) },
];

fs.mkdirSync('raw', { recursive: true });
fs.writeFileSync(BULK, JSON.stringify(bulk));

console.log(`\n완료 · 성공 ${ok} · 없어짐 ${gone} · 실패 ${err}`);
console.log(`${LEDGER} — ${Object.keys(ledger).length}건`);
console.log(`${BULK} — KV 에 올릴 ${bulk.length}건 (${(fs.statSync(BULK).size / 1024).toFixed(0)}KB)`);
console.log(`  그중 목록용 g:all — ${Object.keys(aggregate).length}곳 (${(JSON.stringify(aggregate).length / 1024).toFixed(0)}KB)`);
console.log('\n올리기 (worker 폴더에서):');
console.log(`  npx wrangler kv bulk put ../${BULK} --binding RATINGS --remote`);
