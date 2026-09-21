// 구글 매칭이 맞게 붙었는지 표본으로 잰다. **3열을 켜기 전의 게이트다.**
//
// 왜 필요한가: googlePlaceId 3,613건은 Text Search 로 붙인 것이고 맞는지 잰 적이 없다.
// 틀렸을 때의 결과는 "평점 없음" 이 아니라 **다른 가게의 평점을 이 가게 것으로 보여 주는 것**이다.
// 없는 것보다 나쁘다. 오류율 5% 를 넘으면 exit 1 로 멈춘다.
//
// 요금: fieldMask 에 평점 필드를 넣지 않는다.
//   formattedAddress · location   → Place Details **Essentials** (월 10,000건 무료)
//   displayName                   → Place Details **Pro**        (월 5,000건 무료, $17/1,000)
//   rating · userRatingCount      → Place Details Enterprise     (월 1,000건 무료) ← 안 쓴다
// 한 요청은 가장 높은 등급으로 과금되므로 이 스크립트는 **Pro** 로 집계된다.
// 평점용 Enterprise 무료 한도(월 1,000)를 한 건도 쓰지 않는다 — 별개 SKU 다.
//
// 사용:
//   node scripts/google-verify-match.mjs --dry            뽑기만 하고 안 부른다
//   GOOGLE_PLACES_KEY=... node scripts/google-verify-match.mjs
//   ... --n=50 --seed=20260921                            표본 수·난수 씨앗(재현용)
//
// 결과는 reports/google-match-sample.md 에 쓴다(reports/ 는 gitignore 다 — 판정은
// 문서에 옮겨 적는다).

import fs from 'node:fs';
import { readPlaces, sleep, args } from './lib/places-io.mjs';
import { distanceM, nameMatch, verifyVerdict } from './lib/match-rules.mjs';

const OUT = 'reports/google-match-sample.md';
const FIELD_MASK = 'displayName,formattedAddress,location';

const A = args();
const N = Number(A.n ?? 50);
const SEED = Number(A.seed ?? 20260921);
const DELAY = Number(A.delay ?? 120);
const NEAR_M = 150; // 이 안이면 "같은 자리"
const FAIL_RATE = 0.05; // mismatch 비율이 이걸 넘으면 게이트가 막는다

// 씨앗 난수(mulberry32). Math.random 을 쓰면 같은 표본을 다시 못 뽑아 판정을 재확인할 수 없다.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function fetchDetails(placeId, key) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`, {
    headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK },
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return {
    name: j.displayName?.text ?? '',
    address: j.formattedAddress ?? '',
    lat: j.location?.latitude,
    lng: j.location?.longitude,
  };
}

// ---------- 표본 뽑기 ----------

const all = readPlaces().filter((p) => p.googlePlaceId);
if (!all.length) {
  console.error('googlePlaceId 가 붙은 장소가 없습니다. npm run match 를 먼저 돌리세요.');
  process.exit(1);
}

// 정렬을 고정한 뒤 씨앗 난수로 섞는다(Fisher-Yates). places.json 순서가 바뀌어도
// 같은 씨앗이면 같은 표본이 나오도록 placeId 로 한 번 정렬하고 시작한다.
const pool = [...all].sort((a, b) => String(a.placeId).localeCompare(String(b.placeId)));
const rand = rng(SEED);
for (let i = pool.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [pool[i], pool[j]] = [pool[j], pool[i]];
}
const sample = pool.slice(0, Math.min(N, pool.length));

console.log(`구글 ID 보유 ${all.length}곳 → 표본 ${sample.length}곳 (seed=${SEED})`);
console.log('과금 등급: Place Details Pro (월 5,000건 무료). 평점 SKU 는 건드리지 않습니다.');

if (A.dry) {
  console.log('\n--dry 이므로 부르지 않았습니다. 뽑힌 표본 앞 5곳:');
  for (const p of sample.slice(0, 5)) console.log(`  ${p.name} · ${p.googlePlaceId}`);
  process.exit(0);
}

const KEY = process.env.GOOGLE_PLACES_KEY;
if (!KEY) {
  console.error(
    'GOOGLE_PLACES_KEY 가 없습니다.\n' +
      '  PowerShell:  $env:GOOGLE_PLACES_KEY = "..."\n' +
      '  bash:        export GOOGLE_PLACES_KEY=...',
  );
  process.exit(1);
}

// ---------- 대조 ----------

const rows = [];
for (const [i, p] of sample.entries()) {
  let g = null;
  let error = '';
  try {
    g = await fetchDetails(p.googlePlaceId, KEY);
  } catch (e) {
    error = String(e.message ?? e);
    if (error.includes('RATE_LIMIT')) await sleep(30000);
  }

  if (error || !g) {
    rows.push({ p, v: 'error', note: error || '응답 없음' });
  } else if (g.gone) {
    rows.push({ p, v: 'error', note: '구글에 없는 ID (404)' });
  } else {
    const dist =
      typeof g.lat === 'number' && typeof g.lng === 'number'
        ? Math.round(distanceM(p.lat, p.lng, g.lat, g.lng))
        : null;
    const nameOk = nameMatch(p.name, g.name);
    rows.push({ p, g, dist, nameOk, v: verifyVerdict(nameOk, dist, NEAR_M) });
  }

  if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${sample.length}`);
  await sleep(DELAY);
}

// ---------- 보고서 ----------

const count = (v) => rows.filter((r) => r.v === v).length;
const judged = rows.filter((r) => r.v !== 'error').length;
const bad = count('mismatch');
// 오류율의 분모는 판정된 건이다. 호출 실패까지 분모에 넣으면 실패가 많을수록
// 오류율이 낮아 보여 게이트가 반대로 헐거워진다.
const rate = judged ? bad / judged : 0;

const mark = { ok: '✅ ok', suspect: '⚠️ suspect', mismatch: '❌ mismatch', error: '· error' };
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');

const lines = [
  '# 구글 매칭 표본 검증',
  '',
  `${new Date().toISOString().slice(0, 10)} · 표본 ${sample.length}곳 / 구글 ID 보유 ${all.length}곳 · \`--seed=${SEED}\``,
  '',
  '## 결과',
  '',
  `| 판정 | 건수 |`,
  `|---|---|`,
  `| ✅ ok | ${count('ok')} |`,
  `| ⚠️ suspect | ${count('suspect')} |`,
  `| ❌ mismatch | ${bad} |`,
  `| · error (호출 실패·404) | ${count('error')} |`,
  '',
  `**오류율 ${(rate * 100).toFixed(1)}%** (mismatch ${bad} / 판정된 ${judged}건) — 기준 ${FAIL_RATE * 100}% ${rate > FAIL_RATE ? '**초과. 3열을 켜지 않는다.**' : '이하. 게이트 통과.'}`,
  '',
  '## 판정 기준',
  '',
  `- **이름 일치**: 괄호·기호·공백을 걷고 소문자로 맞춘 뒤 ① 한쪽이 다른 쪽을 포함하거나 ② 앞에서 3글자 이상 겹치고 그 길이가 짧은 쪽의 절반을 넘으면 일치로 본다. 구글 한국 등록명에 외국어·업종어가 덧붙고("기태만두Gitae饺子") 우리 쪽에 지점명이 붙기 때문이다.`,
  `- **좌표 일치**: 하버사인 거리 ${NEAR_M}m 이내.`,
  `- \`ok\` = 이름·좌표 둘 다 / \`suspect\` = 하나만 / \`mismatch\` = 둘 다 불일치.`,
  '',
  '> ⚠️ 자동 판정은 보조다. 이름 정규화(`scripts/lib/match-rules.mjs`)를 매칭기와 **공유**하므로,',
  '> 매칭기가 틀린 방식으로 틀렸다면 여기서도 같은 방식으로 통과시킨다.',
  '> 실제 게이트는 아래 표를 사람이 눈으로 보는 것이다. 특히 `suspect` 는 전부 확인한다.',
  '',
  '## 표',
  '',
  '| # | 우리 이름 | 구글 이름 | 우리 주소 | 구글 주소 | 거리 | 판정 |',
  '|---|---|---|---|---|---|---|',
];

rows.forEach((r, i) => {
  lines.push(
    `| ${i + 1} | ${esc(r.p.name)} | ${esc(r.g?.name ?? r.note ?? '')} | ${esc(r.p.address)} | ${esc(r.g?.address ?? '')} | ${r.dist == null ? '—' : `${r.dist}m`} | ${mark[r.v]} |`,
  );
});

lines.push('', '판정된 place ID (재확인용):', '');
rows.forEach((r, i) => lines.push(`${i + 1}. \`${r.p.googlePlaceId}\` — https://www.google.com/maps/place/?q=place_id:${r.p.googlePlaceId}`));
lines.push('');

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(OUT, lines.join('\n'), 'utf8');

console.log(`\nok ${count('ok')} · suspect ${count('suspect')} · mismatch ${bad} · error ${count('error')}`);
console.log(`오류율 ${(rate * 100).toFixed(1)}% (기준 ${FAIL_RATE * 100}%)`);
console.log(`${OUT} 에 표를 적었습니다. suspect 는 사람이 전부 확인하세요.`);

if (rate > FAIL_RATE) {
  console.error('\n오류율이 기준을 넘었습니다. 구글 3열을 켜지 마세요.');
  process.exit(1);
}
