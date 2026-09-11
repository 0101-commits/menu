// 저장된 맛집을 카카오·구글의 장소 ID 에 연결한다.
//
// 왜 필요한가: 우리 데이터의 유일한 외부 키는 네이버 place ID 뿐이다.
// 카카오 평점(panel3)과 구글 평점(Place Details)은 각자의 ID 를 요구한다.
//
// 오매칭이 가장 나쁜 실패다 — 다른 가게의 평점이 붙는다.
// 그래서 이름과 거리가 함께 맞을 때만 채택하고, 애매하면 비워 둔다.
// 비어 있으면 화면에서 "—" 로 보일 뿐이지만, 틀린 값은 거짓말이 된다.
//
//   high    정규화한 이름이 같고 80m 이내
//   medium  이름이 같고 300m 이내  또는  30m 이내이고 업종 대분류가 같음
//   (그 외) 채택하지 않음
//
// 키
//   KAKAO_REST_KEY    카카오 개발자 콘솔 > 내 애플리케이션 > 앱 키 > REST API 키
//                     무료. 카드 등록 불필요. 일 100,000 건.
//   GOOGLE_PLACES_KEY Google Cloud > Places API (New)
//                     Text Search 는 월 5,000 건까지 무료지만 결제수단 등록이 필요하다.
//                     없으면 구글 매칭만 건너뛰고 카카오는 그대로 돈다.
//
// 사용:
//   node scripts/match.mjs                  아직 매칭 안 된 것만
//   node scripts/match.mjs --limit=200
//   node scripts/match.mjs --source=kakao   구글 건너뛰기
//   node scripts/match.mjs --recheck        이미 매칭된 것도 다시

import fs from 'node:fs';
import { readPlaces, readJson, writeJson, sleep, args } from './lib/places-io.mjs';

const OUT = 'raw/match.json';
const A = args();
const SOURCE = A.source ?? 'both';
const DELAY = Number(A.delay ?? 120);

const KAKAO_KEY = process.env.KAKAO_REST_KEY;
const GOOGLE_KEY = process.env.GOOGLE_PLACES_KEY;

if (!KAKAO_KEY && SOURCE !== 'google') {
  console.error('KAKAO_REST_KEY 가 없습니다. .env 에 넣거나 환경변수로 전달하세요. (docs/keys.html 참고)');
  process.exit(1);
}

// ---------- 이름 정규화 ----------
// 지점 표기는 소스마다 다르다. "자매수산 강남본점" / "자매수산" 을 같게 본다.
const BRANCH = /(본점|직영점|점포|\d+호점|[가-힣A-Za-z]{1,10}점)$/;
function norm(name) {
  let s = String(name ?? '')
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/[\s·・.,'"`~!@#$%^&*_+=|\\/-]/g, '')
    .toLowerCase();
  // 지점 접미사는 한 번만 떼어 낸다. 반복하면 "고기집" 의 "집" 까지 깎인다.
  s = s.replace(BRANCH, '');
  return s;
}

function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 우리 대분류 ↔ 카카오 category_name 1단계. 30m 이내 근접 매칭의 보조 판정에만 쓴다.
const COARSE = {
  카페: '음식점', 디저트: '음식점', 술집: '음식점',
};
function coarseOk(place, doc) {
  const head = String(doc.category_name ?? '').split('>')[0].trim();
  return head === (COARSE[place.category] ?? '음식점');
}

// ---------- 카카오 ----------
async function kakaoSearch(place) {
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.searchParams.set('query', place.name);
  url.searchParams.set('x', String(place.lng));
  url.searchParams.set('y', String(place.lat));
  url.searchParams.set('radius', '1000');
  url.searchParams.set('size', '15');
  url.searchParams.set('sort', 'distance');

  const res = await fetch(url, {
    headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('KAKAO_AUTH: REST 키를 확인하세요');
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).documents ?? [];
}

function pickKakao(place, docs) {
  const target = norm(place.name);
  let best = null;
  for (const d of docs) {
    const dist = distanceM(place.lat, place.lng, Number(d.y), Number(d.x));
    const same = norm(d.place_name) === target;
    let confidence = null;
    if (same && dist <= 80) confidence = 'high';
    else if (same && dist <= 300) confidence = 'medium';
    else if (dist <= 30 && coarseOk(place, d)) confidence = 'medium';
    if (!confidence) continue;
    const rank = confidence === 'high' ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist)) {
      best = { id: String(d.id), confidence, dist, rank, name: d.place_name };
    }
  }
  return best;
}

// ---------- 구글 ----------
// fieldMask 를 id·location·displayName 으로 제한하면 Text Search Pro SKU 다.
// 월 5,000 건까지 무료라 4,000 여 건 1 회 매칭은 요금이 발생하지 않는다.
// 이름 확인 없이 id 만 받으면(무료 IDs Only) 오매칭을 걸러낼 수 없어 쓰지 않는다.
async function googleSearch(place) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_KEY,
      'X-Goog-FieldMask': 'places.id,places.location,places.displayName',
    },
    body: JSON.stringify({
      textQuery: `${place.name} ${place.sigungu ?? ''} ${place.dong ?? ''}`.trim(),
      languageCode: 'ko',
      regionCode: 'KR',
      maxResultCount: 5,
      locationBias: {
        circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 1000 },
      },
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401 || res.status === 403) throw new Error('GOOGLE_AUTH: API 키·결제 설정을 확인하세요');
  if (res.status === 429) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
  return (await res.json()).places ?? [];
}

function pickGoogle(place, docs) {
  const target = norm(place.name);
  let best = null;
  for (const d of docs) {
    const lat = d.location?.latitude, lng = d.location?.longitude;
    if (lat == null || lng == null) continue;
    const dist = distanceM(place.lat, place.lng, lat, lng);
    const same = norm(d.displayName?.text) === target;
    let confidence = null;
    if (same && dist <= 80) confidence = 'high';
    else if (same && dist <= 300) confidence = 'medium';
    if (!confidence) continue;
    const rank = confidence === 'high' ? 0 : 1;
    if (!best || rank < best.rank || (rank === best.rank && dist < best.dist)) {
      best = { id: d.id, confidence, dist, rank, name: d.displayName?.text };
    }
  }
  return best;
}

// ---------- 실행 ----------
async function withRetry(fn, label) {
  for (let i = 0; i < 4; i++) {
    try {
      return await fn();
    } catch (e) {
      const msg = String(e.message ?? e);
      if (msg.startsWith('KAKAO_AUTH') || msg.startsWith('GOOGLE_AUTH')) throw e; // 재시도해도 안 된다
      if (i === 3) return { __error: msg };
      await sleep(msg.includes('RATE_LIMIT') ? 20000 * (i + 1) : 1000 * (i + 1));
    }
  }
}

const places = readPlaces();
const store = readJson(OUT, {});
const wantGoogle = SOURCE !== 'kakao' && Boolean(GOOGLE_KEY);

if (SOURCE !== 'kakao' && !GOOGLE_KEY) {
  console.log('GOOGLE_PLACES_KEY 없음 — 구글 매칭은 건너뜁니다 (카카오만 진행)');
}

let targets = places.filter((p) => {
  const cur = store[p.placeId];
  if (A.recheck) return true;
  const needK = SOURCE !== 'google' && !cur?.kakaoId && !cur?.kakaoMiss;
  const needG = wantGoogle && !cur?.googlePlaceId && !cur?.googleMiss;
  return needK || needG;
});
if (A.limit) targets = targets.slice(0, Number(A.limit));

console.log(`장소 ${places.length}건 · 대상 ${targets.length}건 · 예상 ${Math.ceil((targets.length * DELAY * (wantGoogle ? 2 : 1)) / 60000)}분`);

const stat = { kHigh: 0, kMed: 0, kMiss: 0, kErr: 0, gHigh: 0, gMed: 0, gMiss: 0, gErr: 0 };
let done = 0;

for (const p of targets) {
  const cur = (store[p.placeId] ??= { name: p.name });

  if (SOURCE !== 'google' && (A.recheck || (!cur.kakaoId && !cur.kakaoMiss))) {
    const docs = await withRetry(() => kakaoSearch(p), 'kakao');
    if (docs.__error) { stat.kErr++; }
    else {
      const hit = pickKakao(p, docs);
      if (hit) {
        cur.kakaoId = hit.id;
        cur.confidence = hit.confidence;
        cur.kakaoName = hit.name;
        cur.kakaoDist = Math.round(hit.dist);
        hit.confidence === 'high' ? stat.kHigh++ : stat.kMed++;
        delete cur.kakaoMiss;
      } else { cur.kakaoMiss = true; stat.kMiss++; }
    }
    await sleep(DELAY);
  }

  if (wantGoogle && (A.recheck || (!cur.googlePlaceId && !cur.googleMiss))) {
    const docs = await withRetry(() => googleSearch(p), 'google');
    if (docs.__error) { stat.gErr++; }
    else {
      const hit = pickGoogle(p, docs);
      if (hit) {
        cur.googlePlaceId = hit.id;
        cur.googleConfidence = hit.confidence;
        hit.confidence === 'high' ? stat.gHigh++ : stat.gMed++;
        delete cur.googleMiss;
      } else { cur.googleMiss = true; stat.gMiss++; }
    }
    await sleep(DELAY);
  }

  if (++done % 50 === 0) {
    writeJson(OUT, store);
    console.log(`  ${done}/${targets.length} · 카카오 high ${stat.kHigh}/med ${stat.kMed}/미매칭 ${stat.kMiss}/오류 ${stat.kErr}` +
      (wantGoogle ? ` · 구글 high ${stat.gHigh}/med ${stat.gMed}/미매칭 ${stat.gMiss}/오류 ${stat.gErr}` : ''));
  }
}

writeJson(OUT, store);

const total = places.length;
const kRate = ((stat.kHigh + stat.kMed) / (targets.length || 1)) * 100;
console.log(`\n완료 → ${OUT}`);
console.log(JSON.stringify(stat));
console.log(`이번 회차 카카오 매칭률 ${kRate.toFixed(1)}%`);

// medium 은 사람이 확인할 수 있게 리포트로 남긴다. 확정·교정은 raw/match.json 을 직접 고치면 된다.
fs.mkdirSync('reports', { recursive: true });
const med = Object.entries(store).filter(([, v]) => v.confidence === 'medium');
fs.writeFileSync(
  `reports/match-${new Date().toISOString().slice(0, 10)}.md`,
  [
    `# 매칭 리포트 — ${new Date().toISOString().slice(0, 10)}`, '',
    `전체 ${total}건 · 이번 대상 ${targets.length}건`, '',
    '```json', JSON.stringify(stat, null, 2), '```', '',
    `## 확인이 필요한 medium 매칭 (${med.length})`, '',
    '이름이나 거리 중 하나만 맞은 건입니다. 틀렸으면 `raw/match.json` 에서 해당 항목의 `kakaoId` 를 지우세요.', '',
    '| 우리 이름 | 카카오 이름 | 거리 |', '|---|---|---:|',
    ...med.map(([, v]) => `| ${v.name} | ${v.kakaoName ?? '—'} | ${v.kakaoDist ?? '—'}m |`),
  ].join('\n'),
);
console.log(`리포트 → reports/match-${new Date().toISOString().slice(0, 10)}.md`);
