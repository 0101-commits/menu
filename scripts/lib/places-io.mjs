// places 데이터를 읽는 한 곳.
//
// P0 에서 src/data/places.ts 가 public/data/places.json 으로 옮겨간다.
// 스크립트들이 둘 다 겪게 되므로 읽기 경로를 여기 한 곳에 모은다.
// 새 경로가 있으면 그걸 쓰고, 없으면 예전 .ts 를 파싱한다.

import fs from 'node:fs';

export const PLACES_JSON = 'public/data/places.json';
export const PLACES_TS = 'src/data/places.ts';

// places.ts 한 줄에서 필드를 뜯는다. 필드 순서에 기대지 않는다.
function parseTs(ts) {
  return ts
    .split('\n')
    .filter((l) => l.trim().startsWith('{ id:'))
    .map((l) => {
      const s = (re) => (l.match(re) ?? [])[1];
      const n = (re) => {
        const v = (l.match(re) ?? [])[1];
        return v === undefined ? undefined : Number(v);
      };
      return {
        id: n(/id: (\d+)/),
        name: s(/name: "(.*?)"/),
        category: s(/category: "(.*?)"/),
        folder: s(/folder: "(.*?)"/),
        mcidName: s(/mcidName: "(.*?)"/),
        placeId: s(/placeId: "(.*?)"/),
        lat: n(/lat: ([-\d.]+)/),
        lng: n(/lng: ([-\d.]+)/),
        address: s(/address: "(.*?)"/),
        naverUrl: s(/naverUrl: "(.*?)"/),
        kakaoId: s(/kakaoId: "(.*?)"/),
        googlePlaceId: s(/googlePlaceId: "(.*?)"/),
      };
    });
}

export function readPlaces() {
  if (fs.existsSync(PLACES_JSON)) {
    const j = JSON.parse(fs.readFileSync(PLACES_JSON, 'utf8'));
    return Array.isArray(j) ? j : j.places;
  }
  if (fs.existsSync(PLACES_TS)) return parseTs(fs.readFileSync(PLACES_TS, 'utf8'));
  throw new Error(`장소 데이터를 찾을 수 없습니다 (${PLACES_JSON} / ${PLACES_TS})`);
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data, pretty = false) {
  fs.mkdirSync(file.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, pretty ? 2 : 0));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 인자 파싱. --key=value 와 --flag 둘 다 받는다.
export function args(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (const a of argv) {
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, v] = a.slice(2).split('=');
    out[k] = v === undefined ? true : v;
  }
  return out;
}
