// 즐겨찾기 수집분(raw/myplace-*.json)의 장소를 네이버 플레이스 페이지로 보강한다.
// 얻는 것: 지번 주소와 세부 업종.
//
// 왜 필요한가: 즐겨찾기 API 는 도로명 주소와 "음식점" 수준의 대분류만 준다.
// PlaceList 의 시/도–시군구–동 3단 필터는 지번 토큰을 전제로 하고,
// places.ts 의 mcidName 은 "카페,디저트" 같은 세분류다.
//
// 소스: https://m.place.naver.com/restaurant/{sid}/home
//   - 인증 불필요. 업종과 무관하게 /restaurant/ 경로로 조회된다(카페·주점 확인).
//   - map.naver.com/p/api/place/summary 는 같은 값을 주지만 짧은 연속 호출에
//     IP 차단(400/403)이 걸린다. 그래서 쓰지 않는다.
//
// 기본적으로 --only-new 로 돌린다. places.ts 에 이미 있는 장소는 지번 주소와
// 세분류를 이미 갖고 있으므로 다시 받을 이유가 없다.
//
// 사용: node scripts/enrich.mjs --only-new

import fs from 'node:fs';
import path from 'node:path';

const RAW_DIR = 'raw';
const DELAY_MS = 1500; // 차단을 피하는 게 속도보다 중요하다
const MAX_RETRY = 4;
const ONLY_NEW = process.argv.includes('--only-new');

const SIDO_HEAD = /^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/;

function latest(re) {
  const f = fs.readdirSync(RAW_DIR).filter((n) => re.test(n)).sort();
  if (!f.length) throw new Error(`${RAW_DIR}에 입력 파일이 없습니다`);
  return path.join(RAW_DIR, f[f.length - 1]);
}

const inFile = process.argv.find((a) => a.endsWith('.json')) ?? latest(/^myplace-.*\.json$/);
const outFile = path.join(RAW_DIR, path.basename(inFile).replace('myplace-', 'enriched-'));

const src = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const places = src.places.filter((p) => p.type === 'place' && p.sid);

const done = fs.existsSync(outFile)
  ? new Map(JSON.parse(fs.readFileSync(outFile, 'utf8')).places.map((p) => [p.sid, p]))
  : new Map();

let known = new Set();
if (ONLY_NEW) {
  const ts = fs.readFileSync('src/data/places.ts', 'utf8');
  known = new Set([...ts.matchAll(/place\/(\d+)/g)].map((m) => m[1]));
}

const todo = places.filter((p) => !done.has(p.sid) && !known.has(p.sid));
console.log(`입력 ${inFile} — 장소 ${places.length}건`);
if (ONLY_NEW) console.log(`places.ts 에 이미 있는 ${known.size}건은 건너뜁니다`);
console.log(`보강 완료 ${done.size}건 / 이번에 받을 것 ${todo.length}건 (예상 ${Math.ceil((todo.length * DELAY_MS) / 60000)}분)`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetail(sid) {
  const res = await fetch(`https://m.place.naver.com/restaurant/${sid}/home`, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'accept-language': 'ko-KR,ko;q=0.9',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 429 || res.status === 403) throw new Error('RATE_LIMIT');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  // 페이지에 삽입된 JSON 에서 첫 address / category 를 집는다.
  // 두 번째 "address" 는 UI 라벨("주소")이라 첫 값만 유효하다.
  const jibun = (html.match(/"address":"([^"]+)"/) ?? [])[1] ?? null;
  const road = (html.match(/"roadAddress":"([^"]+)"/) ?? [])[1] ?? null;
  const category = (html.match(/"category":"([^"]+)"/) ?? [])[1] ?? null;

  // 지번이 시/도로 시작하지 않으면 파싱이 어긋난 것이다. 조용히 쓰지 않는다.
  if (jibun && !SIDO_HEAD.test(jibun)) return { parseError: jibun, road, category };
  return { jibun, road, category };
}

const failures = [];
let processed = 0;

function flush() {
  fs.writeFileSync(
    outFile,
    JSON.stringify({ enrichedAt: new Date().toISOString(), source: inFile, total: done.size, failures, places: [...done.values()] }),
  );
}

for (const p of todo) {
  let saved = null;
  for (let attempt = 0; attempt < MAX_RETRY && !saved; attempt++) {
    try {
      saved = { ...p, ...(await fetchDetail(p.sid)) };
    } catch (e) {
      const rate = String(e).includes('RATE_LIMIT');
      if (attempt === MAX_RETRY - 1) {
        failures.push({ sid: p.sid, name: p.name, error: String(e) });
        saved = { ...p, enrichError: String(e) };
      } else {
        if (rate) console.log(`    레이트리밋 — ${30 * (attempt + 1)}초 대기`);
        await sleep(rate ? 30000 * (attempt + 1) : 1500 * (attempt + 1));
      }
    }
  }
  done.set(p.sid, saved);
  if (++processed % 25 === 0) {
    console.log(`  ${processed}/${todo.length} … 실패 ${failures.length}`);
    flush();
  }
  await sleep(DELAY_MS);
}
flush();

const vals = [...done.values()];
console.log(`\n완료 → ${outFile}`);
console.log(
  `  총 ${done.size}건 / 지번 확보 ${vals.filter((p) => p.jibun).length} / 폐업·삭제 ${vals.filter((p) => p.gone).length} / 파싱 어긋남 ${vals.filter((p) => p.parseError).length} / 실패 ${failures.length}`,
);
