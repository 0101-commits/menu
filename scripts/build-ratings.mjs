// raw/ratings.json(수집 원본)을 앱이 읽는 public/data/ratings.json 으로 줄여 쓴다.
//
// 원본에는 수집 시각·실패 사유가 섞여 있다. 앱에 필요한 것만 남겨 크기를 줄이고,
// 실패율을 게이트로 검사한다. 비공식 경로를 쓰는 만큼 조용히 망가지는 것을 막는 게 목적이다.
//
// 사용: node scripts/build-ratings.mjs [--dry]

import fs from 'node:fs';
import { readPlaces, readJson, writeJson, args } from './lib/places-io.mjs';

const A = args();
const IN = 'raw/ratings.json';
const OUT = 'public/data/ratings.json';

const raw = readJson(IN, null);
if (!raw) {
  console.error(`${IN} 이 없습니다. 먼저 node scripts/ratings.mjs 를 돌리세요.`);
  process.exit(1);
}

const places = readPlaces();
const known = new Map(places.map((p) => [p.placeId, p]));
const withKakaoId = places.filter((p) => p.kakaoId).length;

const out = {};
const stat = {
  entries: 0, naverScore: 0, naverNoScore: 0, naverFail: 0, naverGone: 0,
  kakaoScore: 0, kakaoFail: 0, closed: 0, orphan: 0,
};
const closedList = [];

for (const [sid, v] of Object.entries(raw)) {
  const place = known.get(sid);
  if (!place) { stat.orphan++; continue; } // 즐겨찾기에서 빠진 장소의 잔여 평점

  const entry = {};

  const n = v.naver;
  if (n) {
    if (n.error) stat.naverFail++;
    else if (n.gone) { stat.naverGone++; closedList.push(`${place.name} — 네이버 페이지 없음`); }
    else if (n.parseError) stat.naverFail++;
    else {
      if (n.score == null) stat.naverNoScore++; else stat.naverScore++;
      entry.naver = {
        score: n.score ?? null,
        visitors: n.visitors ?? 0,
        blogs: n.blogs ?? 0,
        // 옛 형식(문자열 배열)은 업주 등록 검색 키워드라 뜻이 다르다. 새 형식만 내보낸다.
        ...(n.keywords?.length && typeof n.keywords[0] === 'object'
          ? { keywords: n.keywords.slice(0, 6) }
          : {}),
        ...(n.booking ? { booking: n.booking } : {}),
      };
    }
  }

  const k = v.kakao;
  if (k) {
    if (k.error || k.gone) stat.kakaoFail++;
    else {
      if (k.score != null) stat.kakaoScore++;
      if (k.closed) { stat.closed++; closedList.push(`${place.name} — 카카오 영업상태 아님`); }
      entry.kakao = {
        score: k.score ?? null,
        count: k.count ?? 0,
        blogs: k.blogs ?? 0,
        ...(k.price ? { price: k.price } : {}),
        ...(k.hours ? { hours: k.hours } : {}),
        ...(k.menus?.length ? { menus: k.menus.slice(0, 3) } : {}),
        ...(k.rank ? { rank: k.rank } : {}),
        ...(k.closed ? { closed: true } : {}),
      };
    }
  }

  if (Object.keys(entry).length) { out[sid] = entry; stat.entries++; }
}

// ---------- 게이트 ----------
const naverTried = stat.naverScore + stat.naverNoScore + stat.naverFail + stat.naverGone;
const naverFailRate = naverTried ? stat.naverFail / naverTried : 0;
const kakaoTried = stat.kakaoScore + stat.kakaoFail;
const kakaoFailRate = kakaoTried ? stat.kakaoFail / kakaoTried : 0;

const gates = [
  ['네이버 파싱 실패율 < 1%', naverFailRate < 0.01, `${(naverFailRate * 100).toFixed(2)}% (${stat.naverFail}/${naverTried})`],
  ['카카오 파싱 실패율 < 1%', kakaoFailRate < 0.01, `${(kakaoFailRate * 100).toFixed(2)}% (${stat.kakaoFail}/${kakaoTried})`],
  ['평점 보유 장소 ≥ 1건', stat.entries > 0, `${stat.entries}건`],
];

console.log(`입력 ${IN} — ${Object.keys(raw).length}건 (장소 목록에 없는 것 ${stat.orphan}건 제외)`);
console.log(`네이버: 점수 ${stat.naverScore} · 점수없음 ${stat.naverNoScore} · 실패 ${stat.naverFail} · 페이지없음 ${stat.naverGone}`);
console.log(`카카오: 점수 ${stat.kakaoScore} · 실패 ${stat.kakaoFail} (kakaoId 보유 장소 ${withKakaoId}건)`);
console.log(`폐업 의심 ${closedList.length}건`);

console.log('\n게이트');
for (const [n, pass, d] of gates) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${n}${d ? ` — ${d}` : ''}`);
const failed = gates.filter(([, p]) => !p);

fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync(
  `reports/ratings-${new Date().toISOString().slice(0, 10)}.md`,
  [
    `# 평점 수집 리포트 — ${new Date().toISOString().slice(0, 10)}`, '',
    '| 항목 | 값 |', '|---|---:|',
    `| 평점 보유 장소 | ${stat.entries} / ${places.length} |`,
    `| 네이버 점수 확보 | ${stat.naverScore} |`,
    `| 네이버 점수 미제공 | ${stat.naverNoScore} |`,
    `| 네이버 파싱 실패 | ${stat.naverFail} |`,
    `| 카카오 점수 확보 | ${stat.kakaoScore} |`,
    `| 카카오 파싱 실패 | ${stat.kakaoFail} |`, '',
    '## 게이트', '', '| 항목 | 결과 | 비고 |', '|---|---|---|',
    ...gates.map(([n, p, d]) => `| ${n} | ${p ? 'PASS' : 'FAIL'} | ${d || '—'} |`), '',
    `## 폐업 의심 (${closedList.length})`, '',
    ...closedList.map((s) => `- ${s}`),
  ].join('\n'),
);

if (failed.length) { console.error(`\n게이트 ${failed.length}건 실패 — ratings.json 을 쓰지 않았습니다.`); process.exit(1); }
if (A.dry) { console.log('\n--dry 이므로 쓰지 않았습니다.'); process.exit(0); }

writeJson(OUT, out);
console.log(`\n${OUT} — ${stat.entries}건 · ${(fs.statSync(OUT).size / 1024).toFixed(0)}KB`);
