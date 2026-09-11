// 이미 만들어 둔 public/data/ratings.json 을 수집 원본(raw/ratings.json)으로 되살린다.
//
// raw/ 는 커밋하지 않는다(.gitignore). CI 는 매 실행이 빈 디렉터리에서 시작하므로
// 이게 없으면 주간 샤드가 1/4 만 수집하고 나머지 3/4 를 잃는다.
//
// 사용: node scripts/restore-ratings.mjs

import fs from 'node:fs';
import { readJson, writeJson } from './lib/places-io.mjs';

const IN = 'public/data/ratings.json';
const OUT = 'raw/ratings.json';

const published = readJson(IN, null);
if (!published) {
  console.log(`${IN} 이 없습니다 — 처음부터 수집합니다.`);
  process.exit(0);
}

const store = readJson(OUT, {});
let restored = 0;

for (const [sid, entry] of Object.entries(published)) {
  // 이번 실행에서 이미 새로 받은 건 덮지 않는다.
  if (store[sid]) continue;
  store[sid] = entry;
  restored++;
}

writeJson(OUT, store);
fs.mkdirSync('raw', { recursive: true });
console.log(`${IN} → ${OUT} · ${restored}건 되살림 (총 ${Object.keys(store).length}건)`);
