// 네이버 MyPlace 즐겨찾기를 수집해 raw/myplace-YYYY-MM-DD.json 을 쓴다.
// 스펙은 docs/myplace-api.md 참조.
//
// 인증: NAVER_COOKIE 환경변수 (.env 또는 CI Secret). 값은 로그에 절대 찍지 않는다.
// 사용: NAVER_COOKIE="..." node scripts/fetch-myplace.mjs

import fs from 'node:fs';

const BASE = 'https://pages.map.naver.com/save-pages/api/maps-bookmark/v3';
const CATEGORIES = ['한식','술집','카페','구이','양식','디저트','일식','중식','국물','해산물','분식','면','기타','아시아'];
const DELAY_MS = 400;
const MAX_RETRY = 3;

const cookie = process.env.NAVER_COOKIE;
if (!cookie) {
  console.error('NAVER_COOKIE 가 없습니다. .env 에 넣거나 환경변수로 전달하세요.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(pathname) {
  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    const res = await fetch(`${BASE}${pathname}`, {
      headers: {
        accept: 'application/json',
        cookie,
        referer: 'https://pages.map.naver.com/save-pages/pc/all-list',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(60000),
    });
    // 쿠키가 죽으면 로그인 페이지로 넘긴다. 조용히 빈 결과를 내지 않고 여기서 끊는다.
    if (res.status === 401 || (res.status >= 300 && res.status < 400)) {
      throw new Error('LOGIN_REQUIRED: NAVER_COOKIE 가 만료됐거나 이 IP에서 무효입니다');
    }
    if (res.ok) {
      const text = await res.text();
      if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
        throw new Error(`LOGIN_REQUIRED: HTML 응답 (${pathname})`);
      }
      return JSON.parse(text);
    }
    if (attempt === MAX_RETRY - 1) throw new Error(`HTTP ${res.status} — ${pathname}`);
    await sleep(800 * (attempt + 1));
  }
}

// 1) 폴더 목록. limit 상한이 20이라 start 로 넘긴다.
const folders = [];
for (let start = 0; start < 500; start += 20) {
  const j = await api(`/folders?start=${start}&limit=20&sort=lastUseTime&folderType=all`);
  if (!j.folders?.length) break;
  folders.push(...j.folders);
  if (folders.length >= j.count) break;
  await sleep(DELAY_MS);
}

const targets = folders.filter((f) => f.folderType === 'MY' && CATEGORIES.includes(f.name));
const declared = Object.fromEntries(targets.map((f) => [f.name, f.bookmarkCount]));
console.log(`폴더 ${folders.length}개 중 수집 대상 ${targets.length}개`);

const missing = CATEGORIES.filter((c) => !targets.some((f) => f.name === c));
if (missing.length) {
  console.error(`대분류 폴더를 찾지 못했습니다: ${missing.join(', ')}`);
  process.exit(1);
}

// 2) 폴더별 장소. start/limit 이 무시되고 전량이 한 번에 온다.
const places = [];
for (const f of targets) {
  const j = await api(`/folders/${f.folderId}?start=0&limit=20`);
  const list = j.bookmarkList ?? [];
  if (list.length !== f.bookmarkCount) {
    console.warn(`  ${f.name}: 선언 ${f.bookmarkCount}건, 수신 ${list.length}건 — 불일치`);
  }
  for (const b of list) {
    places.push({ sid: b.sid, name: b.name, px: b.px, py: b.py, addr: b.address, mcidRaw: b.mcidName, type: b.type, folder: f.name });
  }
  console.log(`  ${f.name} ${list.length}건`);
  await sleep(DELAY_MS);
}

const byFolder = {};
for (const p of places) byFolder[p.folder] = (byFolder[p.folder] ?? 0) + 1;

const stamp = new Date().toISOString().slice(0, 10);
const out = `raw/myplace-${stamp}.json`;
fs.mkdirSync('raw', { recursive: true });
fs.writeFileSync(out, JSON.stringify({
  collectedAt: new Date().toISOString(),
  total: places.length,
  byFolder,
  declared,
  errors: [],
  nonPlace: places.filter((p) => p.type !== 'place').length,
  nullSid: places.filter((p) => !p.sid).length,
  uniqueSid: new Set(places.map((p) => p.sid)).size,
  places,
}, null, 0));

console.log(`\n${out} — ${places.length}건`);
