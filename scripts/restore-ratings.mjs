// 이미 만들어 둔 public/data/ratings.json 을 수집 원본(raw/ratings.json)으로 되살린다.
//
// raw/ 는 커밋하지 않는다(.gitignore). CI 는 매 실행이 빈 디렉터리에서 시작하므로
// 이게 없으면 주간 샤드가 1/4 만 수집하고 나머지 3/4 를 잃는다.
//
// 사용: node scripts/restore-ratings.mjs

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { readJson, writeJson } from './lib/places-io.mjs';

// 되살린 값이 언제 수집된 것인지 알아야 ratings.mjs 의 --refresh 가 동작한다.
// 없으면 매 실행이 4,000곳을 통째로 다시 받는다(월간 크론에서 50분).
// ratings.json 이 마지막으로 커밋된 시각을 그 값으로 쓴다.
function publishedAt() {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', IN], { encoding: 'utf8' }).trim();
    return out || null;
  } catch {
    return null; // 모르면 안 찍는다 → 전부 다시 받는다(안전한 쪽)
  }
}

const IN = 'public/data/ratings.json';
const OUT = 'raw/ratings.json';

const published = readJson(IN, null);
if (!published) {
  console.log(`${IN} 이 없습니다 — 처음부터 수집합니다.`);
  process.exit(0);
}

const store = readJson(OUT, {});
let restored = 0;

const at = publishedAt();
for (const [sid, entry] of Object.entries(published)) {
  // 이번 실행에서 이미 새로 받은 건 덮지 않는다.
  if (store[sid]) continue;
  store[sid] = at
    ? {
        ...entry,
        ...(entry.naver ? { naver: { ...entry.naver, at } } : {}),
        ...(entry.kakao ? { kakao: { ...entry.kakao, at } } : {}),
      }
    : entry;
  restored++;
}

writeJson(OUT, store);
fs.mkdirSync('raw', { recursive: true });
console.log(
  `${IN} → ${OUT} · ${restored}건 되살림 (총 ${Object.keys(store).length}건)` +
    (at ? ` · 수집 시각 ${at.slice(0, 10)} 로 표시` : ' · 수집 시각 모름 → 전량 재수집'),
);
