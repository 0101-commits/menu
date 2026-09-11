// 수집분(raw/myplace-*.json)을 정규화·머지해 src/data/places.ts 를 다시 쓴다.
//
// 필드 출처
//   name, lat, lng, category(=폴더명)  ← 즐겨찾기 API. 매 회차 갱신된다.
//   address(지번), mcidName(세분류)    ← 기존 places.ts 값을 유지하고,
//                                        신규 장소만 raw/enriched-*.json 에서 가져온다.
//                                        즐겨찾기 API 의 주소는 도로명이라 3단 지역 필터에 못 쓴다.
//
// 머지 키는 네이버 place ID(sid). 기존 id 연번은 유지하고 신규만 max+1 부터 잇는다.
// 수작업 보정 이력이 없는 것으로 확인돼 필드 보호 로직은 두지 않는다.
//
// 사용: node scripts/build-places.mjs [--dry]

import fs from 'node:fs';
import path from 'node:path';

const DRY = process.argv.includes('--dry');
const RAW_DIR = 'raw';
const OUT_TS = 'src/data/places.ts';
const REPORT_DIR = 'reports';

const CATEGORIES = ['한식','술집','카페','구이','양식','디저트','일식','중식','국물','해산물','분식','면','기타','아시아'];

// 시/도 축약·구표기를 현행 공식 명칭으로. 지역 필터 드롭다운이 중복되지 않게 하는 게 목적이다.
const SIDO = {
  '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
  '광주':'광주광역시','대전':'대전광역시','울산':'울산광역시',
  '세종':'세종특별자치시','세종시':'세종특별자치시',
  '경기':'경기도','강원':'강원특별자치도','강원도':'강원특별자치도',
  '충북':'충청북도','충남':'충청남도',
  '전북':'전북특별자치도','전라북도':'전북특별자치도','전남':'전라남도',
  '경북':'경상북도','경남':'경상남도',
  '제주':'제주특별자치도','제주도':'제주특별자치도',
};
const SIDO_FULL = new Set(Object.values(SIDO));

function normalizeAddress(addr) {
  if (!addr) return null;
  const parts = String(addr).trim().replace(/\s+/g, ' ').split(' ');
  const head = parts[0];
  if (SIDO[head]) parts[0] = SIDO[head];
  else if (!SIDO_FULL.has(head)) return null; // 시/도로 시작하지 않으면 3단 필터가 깨진다
  return parts.join(' ');
}

function latest(re) {
  const f = fs.readdirSync(RAW_DIR).filter((n) => re.test(n)).sort();
  if (!f.length) throw new Error(`${RAW_DIR}에 ${re} 입력 파일이 없습니다`);
  return path.join(RAW_DIR, f[f.length - 1]);
}

function parseExisting(ts) {
  // 현행(7필드)과 개편 후(9필드) 양쪽을 읽는다. 필드 순서에 의존하지 않게 조각으로 뜯는다.
  return ts
    .split('\n')
    .filter((l) => l.trim().startsWith('{ id:'))
    .map((l) => {
      const g = (k, re) => (l.match(re) ?? [])[1];
      const naverUrl = g('naverUrl', /naverUrl: "(.*?)"/);
      return {
        id: +g('id', /id: (\d+)/),
        name: g('name', /name: "(.*?)"/),
        category: g('category', /category: "(.*?)"/),
        mcidName: g('mcidName', /mcidName: "(.*?)"/),
        lat: +g('lat', /lat: ([-\d.]+)/),
        lng: +g('lng', /lng: ([-\d.]+)/),
        address: g('address', /address: "(.*?)"/),
        naverUrl,
        sid: (naverUrl?.match(/place\/(\d+)/) ?? [])[1] ?? null,
      };
    });
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
const round7 = (n) => Math.round(n * 1e7) / 1e7;

// ---------- 입력 ----------
const rawFile = latest(/^myplace-.*\.json$/);
const raw = JSON.parse(fs.readFileSync(rawFile, 'utf8'));
const base = raw.places.filter((p) => p.type === 'place' && p.sid);
const droppedNonPlace = raw.places.length - base.length;

let enr = new Map();
try {
  const enrFile = latest(/^enriched-.*\.json$/);
  enr = new Map(JSON.parse(fs.readFileSync(enrFile, 'utf8')).places.map((p) => [p.sid, p]));
  console.log(`보강분 ${enrFile} — ${enr.size}건`);
} catch {
  console.log('보강분 없음 — 기존 값만으로 진행합니다');
}

const existing = parseExisting(fs.readFileSync(OUT_TS, 'utf8'));
const oldBySid = new Map(existing.filter((o) => o.sid).map((o) => [o.sid, o]));
console.log(`수집분 ${rawFile} — 장소 ${base.length}건 (장소 아님 ${droppedNonPlace}건 제외)`);
console.log(`기존 ${OUT_TS} — ${existing.length}건 (place ID 없는 항목 ${existing.filter((o) => !o.sid).length}건)`);

// ---------- 정규화 ----------
const problems = { noAddress: [], noCoord: [], badCategory: [], gone: [] };
const normalized = [];

for (const b of base) {
  const prev = oldBySid.get(b.sid);
  const e = enr.get(b.sid) ?? {};

  if (e.gone) { problems.gone.push({ sid: b.sid, name: b.name }); continue; }
  if (!CATEGORIES.includes(b.folder)) { problems.badCategory.push({ sid: b.sid, folder: b.folder }); continue; }

  // 지번 우선순위: 신규 보강분 → 기존 값 → (최후) 즐겨찾기의 도로명
  const address =
    normalizeAddress(e.jibun) ??
    normalizeAddress(prev?.address) ??
    normalizeAddress(e.road) ??
    normalizeAddress(b.addr);
  if (!address) {
    problems.noAddress.push({ sid: b.sid, name: b.name, raw: e.jibun ?? prev?.address ?? b.addr });
    continue;
  }

  if (b.py == null || b.px == null) { problems.noCoord.push({ sid: b.sid, name: b.name }); continue; }

  normalized.push({
    sid: b.sid,
    name: b.name.trim(),
    category: b.folder,
    folder: b.folder,
    mcidName: e.category ?? prev?.mcidName ?? b.mcidRaw ?? '',
    lat: round7(b.py),
    lng: round7(b.px),
    address,
    naverUrl: `https://map.naver.com/v5/entry/place/${b.sid}`,
  });
}

// ---------- 머지 ----------
const freshBySid = new Map(normalized.map((p) => [p.sid, p]));
let maxId = Math.max(...existing.map((o) => o.id));

const added = [], updated = [], unchanged = [];
for (const p of normalized) {
  const prev = oldBySid.get(p.sid);
  if (!prev) { p.id = ++maxId; added.push(p); continue; }
  p.id = prev.id;
  const diffs = ['name', 'category', 'mcidName', 'address'].filter((k) => prev[k] !== p[k]);
  if (Math.abs(prev.lat - p.lat) > 1e-6) diffs.push('lat');
  if (Math.abs(prev.lng - p.lng) > 1e-6) diffs.push('lng');
  if (diffs.length) updated.push({ ...p, diffs, prev }); else unchanged.push(p);
}
const removed = existing.filter((o) => !o.sid || !freshBySid.has(o.sid));

const final = normalized.slice().sort((a, b) => a.id - b.id);

// ---------- 게이트 ----------
const sidoSeen = [...new Set(final.map((p) => p.address.split(' ')[0]))];
const outOfRange = final.filter((p) => !(p.lat > 33 && p.lat < 39 && p.lng > 124 && p.lng < 132));
const gates = [
  ['수집 건수 ≥ 기존 × 0.9', final.length >= existing.length * 0.9, `${final.length} vs ${Math.ceil(existing.length * 0.9)}`],
  ['place ID 중복 0', new Set(final.map((p) => p.sid)).size === final.length, `유니크 ${new Set(final.map((p) => p.sid)).size}`],
  ['좌표 결손 0', final.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)), ''],
  ['좌표 범위 lat 33~39 / lng 124~132', outOfRange.length === 0, outOfRange.map((p) => `${p.name}(${p.lat},${p.lng})`).join(', ')],
  ['category 14종 내', final.every((p) => CATEGORIES.includes(p.category)), ''],
  ['시/도 표기 정규화', sidoSeen.every((s) => SIDO_FULL.has(s)), sidoSeen.filter((s) => !SIDO_FULL.has(s)).join(', ')],
  ['mcidName 결손 0', final.every((p) => p.mcidName), `빈 값 ${final.filter((p) => !p.mcidName).length}건`],
];

console.log('\n게이트');
for (const [name, pass, detail] of gates) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
const failed = gates.filter(([, pass]) => !pass);

console.log(`\n추가 ${added.length} / 변경 ${updated.length} / 유지 ${unchanged.length} / 삭제 ${removed.length} → 최종 ${final.length}건`);
console.log(`제외: 폐업 ${problems.gone.length} / 주소 불가 ${problems.noAddress.length} / 좌표 없음 ${problems.noCoord.length} / 분류 밖 ${problems.badCategory.length}`);

// ---------- 리포트 ----------
fs.mkdirSync(REPORT_DIR, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
const byCat = {};
for (const p of final) byCat[p.category] = (byCat[p.category] ?? 0) + 1;
const diffField = (k) => updated.filter((u) => u.diffs.includes(k));

fs.writeFileSync(path.join(REPORT_DIR, `diff-${stamp}.md`), [
  `# places.ts 동기화 리포트 — ${stamp}`, '',
  `수집: \`${rawFile}\``, '',
  '## 요약', '', '| | 건수 |', '|---|---:|',
  `| 추가 | ${added.length} |`, `| 변경 | ${updated.length} |`, `| 유지 | ${unchanged.length} |`,
  `| 삭제 | ${removed.length} |`, `| **최종** | **${final.length}** |`, '',
  '## 게이트', '', '| 항목 | 결과 | 비고 |', '|---|---|---|',
  ...gates.map(([n, p, d]) => `| ${n} | ${p ? 'PASS' : 'FAIL'} | ${d || '—'} |`), '',
  '## 대분류별 최종 분포', '', '| 대분류 | 건수 |', '|---|---:|',
  ...CATEGORIES.map((c) => `| ${c} | ${byCat[c] ?? 0} |`), `| **합계** | **${final.length}** |`, '',
  '## 변경 내역 요약', '', '| 필드 | 변경 건수 |', '|---|---:|',
  ...['name', 'category', 'mcidName', 'address', 'lat', 'lng'].map((k) => `| ${k} | ${diffField(k).length} |`), '',
  `## 추가된 장소 (${added.length})`, '',
  ...added.map((p) => `- ${p.name} · ${p.category} · ${p.mcidName} — ${p.address}`), '',
  `## 분류가 바뀐 장소 (${diffField('category').length})`, '',
  ...diffField('category').map((u) => `- ${u.name}: ${u.prev.category} → ${u.category}`), '',
  `## 삭제된 장소 (${removed.length})`, '',
  ...removed.map((o) => `- ${o.name} (${o.category})${o.sid ? '' : ' — place ID 없음'}`), '',
  '## 제외된 항목', '',
  `### 폐업·삭제 (${problems.gone.length})`, '',
  ...problems.gone.map((p) => `- ${p.name} (${p.sid})`), '',
  `### 주소를 쓸 수 없음 (${problems.noAddress.length})`, '',
  ...problems.noAddress.map((p) => `- ${p.name} — \`${p.raw ?? '(없음)'}\``), '',
].join('\n'));
console.log(`리포트 → ${REPORT_DIR}/diff-${stamp}.md`);

// ---------- 출력 ----------
if (failed.length) { console.error(`\n게이트 ${failed.length}건 실패 — places.ts 를 쓰지 않았습니다.`); process.exit(1); }
if (DRY) { console.log('\n--dry 이므로 places.ts 를 쓰지 않았습니다.'); process.exit(0); }

const body = final.map((p) =>
  `  { id: ${p.id}, name: "${esc(p.name)}", category: "${esc(p.category)}", folder: "${esc(p.folder)}", ` +
  `mcidName: "${esc(p.mcidName)}", placeId: "${p.sid}", lat: ${p.lat}, lng: ${p.lng}, ` +
  `address: "${esc(p.address)}", naverUrl: "${p.naverUrl}" },`
).join('\n');

fs.writeFileSync(OUT_TS, `export interface Place {
  id: number;
  name: string;
  category: string;
  folder: string;
  mcidName: string;
  placeId: string;
  lat: number;
  lng: number;
  address: string;
  naverUrl: string;
}

export const places: Place[] = [
${body}
];
`);
console.log(`\n${OUT_TS} — ${final.length}건 기록 완료`);
