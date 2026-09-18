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

/** 한국 시간 기준 요일(0=일). KST 는 UTC+9 고정이고 서머타임이 없다. */
function seoulDay(at) {
  return new Date(new Date(at).getTime() + 9 * 3600 * 1000).getUTCDay();
}

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
  hours: { kakao: 0, naver: 0, restored: 0 },
  menus: { kakao: 0, naver: 0, restored: 0 },
};
const closedList = [];

for (const [sid, v] of Object.entries(raw)) {
  const place = known.get(sid);
  if (!place) { stat.orphan++; continue; } // 즐겨찾기에서 빠진 장소의 잔여 평점

  const entry = {};
  // 되살린 값(restore-ratings)에는 top-level closed 만 남아 있을 수 있다.
  // 네이버 페이지가 사라진 장소는 naver 블록 자체가 없어서, 이걸 안 옮기면
  // 다음 빌드에서 "폐업 추정" 배지가 조용히 사라진다.
  if (v.closed) entry.closed = true;

  const n = v.naver;
  if (n) {
    if (n.error) stat.naverFail++;
    else if (n.gone) { stat.naverGone++; closedList.push(`${place.name} — 네이버 페이지 없음`); entry.closed = true; }
    else if (n.parseError) stat.naverFail++;
    else {
      // 0 은 "점수 없음" 이다(shared/parse-place.mjs 주석 참고). 이미 받아 둔 옛 수집분에도
      // 0 이 섞여 있으므로 여기서 한 번 더 걸러 낸다.
      const score = n.score ? n.score : null;
      if (score == null) stat.naverNoScore++; else stat.naverScore++;
      entry.naver = {
        score,
        visitors: n.visitors ?? 0,
        blogs: n.blogs ?? 0,
        // 옛 형식(문자열 배열)은 업주 등록 검색 키워드라 뜻이 다르다. 새 형식만 내보낸다.
        ...(n.keywords?.length && typeof n.keywords[0] === 'object'
          ? { keywords: n.keywords.slice(0, 6) }
          : {}),
        ...(n.scoreHidden ? { scoreHidden: true } : {}),
        ...(n.booking ? { booking: n.booking } : {}),
      };
    }
  }

  const k = v.kakao;
  if (k) {
    if (k.error || k.gone) stat.kakaoFail++;
    else {
      if (k.score != null) stat.kakaoScore++;
      if (k.closed) { stat.closed++; closedList.push(`${place.name} — 카카오 영업상태 아님`); entry.closed = true; }
      entry.kakao = {
        score: k.score ?? null,
        count: k.count ?? 0,
        blogs: k.blogs ?? 0,
        ...(k.price ? { price: k.price } : {}),
        ...(k.rank ? { rank: k.rank } : {}),
        ...(k.closed ? { closed: true } : {}),
      };
    }
  }

  // 영업시간·메뉴는 소스를 가리지 않고 한 자리에 둔다. 카카오가 더 정확하므로 먼저 보고,
  // 없으면 네이버에서 온 것을 쓴다. 카카오에 안 붙은 203곳과 붙었는데 영업시간이 비는
  // 648곳이 여기서 메워진다.
  //
  // hours 는 수집한 날부터 7일이다. 며칠 지나 보는지 모르면 요일이 어긋난다.
  // 요일은 반드시 한국 시간 기준이어야 한다 — CI 러너는 UTC 라, 주간 크론
  // (일 20:00 UTC = 월 05:00 KST)이 그대로면 매번 하루씩 밀린다.
  // 네이버는 요일 이름을 값에 실어 주므로 수집 시각 대신 그 값을 그대로 믿는다.
  //
  // 마지막 갈래(restored)는 restore-ratings 가 되살린 값이다. 되살린 항목은 top-level 에
  // 그대로 실려 오는데 어느 소스에서 왔는지가 남아 있지 않다. 여기서 안 받아 주면
  // raw/ 캐시가 빈 실행마다 영업시간이 통째로 사라진다.
  const hoursFrom =
    (k && !k.error && !k.gone && k.hours?.some((h) => h.trim())
      ? { hours: k.hours, hoursDay: seoulDay(k.at ?? Date.now()), src: 'kakao' }
      : null) ??
    (n && !n.error && !n.gone && n.hours?.some((h) => h.trim())
      ? { hours: n.hours, hoursDay: n.hoursDay ?? seoulDay(n.at ?? Date.now()), src: 'naver' }
      : null) ??
    (v.hours?.some((h) => h.trim()) ? { hours: v.hours, hoursDay: v.hoursDay ?? 0, src: 'restored' } : null);
  if (hoursFrom) {
    entry.hours = hoursFrom.hours;
    entry.hoursDay = hoursFrom.hoursDay;
    stat.hours[hoursFrom.src]++;
  }

  const menusFrom =
    (k && !k.error && !k.gone && k.menus?.length ? { menus: k.menus, src: 'kakao' } : null) ??
    (n && !n.error && !n.gone && n.menus?.length ? { menus: n.menus, src: 'naver' } : null) ??
    (v.menus?.length ? { menus: v.menus, src: 'restored' } : null);
  if (menusFrom) {
    entry.menus = menusFrom.menus.slice(0, 3);
    stat.menus[menusFrom.src]++;
  }

  if (Object.keys(entry).length) { out[sid] = entry; stat.entries++; }
}

// ---------- 게이트 ----------
const naverTried = stat.naverScore + stat.naverNoScore + stat.naverFail + stat.naverGone;
const naverFailRate = naverTried ? stat.naverFail / naverTried : 0;
const kakaoTried = stat.kakaoScore + stat.kakaoFail;
const kakaoFailRate = kakaoTried ? stat.kakaoFail / kakaoTried : 0;

// 이미 내보낸 것보다 크게 줄었으면 쓰지 않는다.
//
// 실패율 게이트만으로는 안 걸리는 사고가 있다. raw/ 가 한쪽 소스만 담은 상태로 빌드하면
// "카카오 파싱 실패율 0/0" 이라 PASS 가 뜨고, 그대로 쓰면 이미 모아 둔 카카오 값 3,364건이
// 통째로 사라진다. raw/ 는 커밋되지 않고 Actions 캐시로만 이어지므로 캐시가 비면 실제로 그렇게 된다.
const prev = readJson(OUT, null);
const prevCount = (key) =>
  prev ? Object.values(prev).filter((v) => v[key] != null).length : 0;
const shrank = (key, now) => {
  const before = prevCount(key);
  // 처음 만들 때(before=0)와 소폭 감소는 통과. 20% 넘게 줄면 사고로 본다.
  return { ok: before === 0 || now >= before * 0.8, detail: `${before} → ${now}` };
};
const naverShrink = shrank('naver', Object.values(out).filter((v) => v.naver).length);
const kakaoShrink = shrank('kakao', Object.values(out).filter((v) => v.kakao).length);

const gates = [
  ['네이버 파싱 실패율 < 1%', naverFailRate < 0.01, `${(naverFailRate * 100).toFixed(2)}% (${stat.naverFail}/${naverTried})`],
  ['카카오 파싱 실패율 < 1%', kakaoFailRate < 0.01, `${(kakaoFailRate * 100).toFixed(2)}% (${stat.kakaoFail}/${kakaoTried})`],
  ['평점 보유 장소 ≥ 1건', stat.entries > 0, `${stat.entries}건`],
  ['네이버 보유 수 유지 (−20% 이내)', naverShrink.ok, naverShrink.detail],
  ['카카오 보유 수 유지 (−20% 이내)', kakaoShrink.ok, kakaoShrink.detail],
];

console.log(`입력 ${IN} — ${Object.keys(raw).length}건 (장소 목록에 없는 것 ${stat.orphan}건 제외)`);
console.log(`네이버: 점수 ${stat.naverScore} · 점수없음 ${stat.naverNoScore} · 실패 ${stat.naverFail} · 페이지없음 ${stat.naverGone}`);
console.log(`카카오: 점수 ${stat.kakaoScore} · 실패 ${stat.kakaoFail} (kakaoId 보유 장소 ${withKakaoId}건)`);
console.log(`영업시간: 카카오 ${stat.hours.kakao} + 네이버 ${stat.hours.naver} + 복원 ${stat.hours.restored} = ${stat.hours.kakao + stat.hours.naver + stat.hours.restored}건`);
console.log(`대표메뉴: 카카오 ${stat.menus.kakao} + 네이버 ${stat.menus.naver} + 복원 ${stat.menus.restored} = ${stat.menus.kakao + stat.menus.naver + stat.menus.restored}건`);
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
    `| 카카오 파싱 실패 | ${stat.kakaoFail} |`,
    `| 영업시간 (카카오+네이버+복원) | ${stat.hours.kakao} + ${stat.hours.naver} + ${stat.hours.restored} |`,
    `| 대표메뉴 (카카오+네이버+복원) | ${stat.menus.kakao} + ${stat.menus.naver} + ${stat.menus.restored} |`, '',
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
