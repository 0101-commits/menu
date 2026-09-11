// 온디맨드 평점 조회 Worker.
//
// 하는 일은 셋뿐이다.
//   1) 브라우저가 직접 못 부르는 곳(네이버·카카오 플레이스, CORS 없음)을 대신 부른다.
//   2) 받은 값을 KV 에 30 일 캐시한다. 구글 정책상 rating 을 그보다 오래 두면 안 되고,
//      캐시가 없으면 무료 한도를 금방 넘긴다.
//   3) 키를 여기에만 둔다. 프런트 번들에 구글 키가 들어가면 누구나 긁어 쓴다.
//
// 요청
//   GET /?n={네이버 place ID}&k={카카오 place ID}&g={구글 place ID}
//   셋 다 선택. 있는 것만 조회해서 합쳐 준다.
//
// 없어도 앱은 돈다. 앱은 이 Worker 가 없으면 발견 모드 평점과 구글 칸만 끈다.

import { fetchNaver, fetchKakao, fetchGoogle } from '../shared/parse-place.mjs';

const DAY = 86400;
const TTL = 30 * DAY; // 구글 정책 상한에 맞춘다. 나머지 소스도 같이 맞춰 단순하게 둔다.

function corsHeaders(origin, allowed) {
  const ok = allowed.length === 0 || allowed.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : 'null',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (body, status, headers) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

/** 하루 호출 수를 센다. 넘으면 그 소스만 건너뛴다 — 앱 전체를 죽이지 않는다. */
async function overQuota(env, key, limit) {
  if (!limit) return false;
  const day = new Date().toISOString().slice(0, 10);
  const k = `quota:${key}:${day}`;
  const used = Number((await env.RATINGS.get(k)) ?? 0);
  if (used >= limit) return true;
  // 정확한 카운터가 아니다(동시 요청에서 몇 건 새어 나갈 수 있다). 한도의 목적은
  // 요금 폭주를 막는 것이지 정확한 과금이 아니므로 이 정도면 충분하다.
  await env.RATINGS.put(k, String(used + 1), { expirationTtl: 2 * DAY });
  return false;
}

async function collect(env, { n, k, g }) {
  const out = {};
  const jobs = [];

  if (n) {
    jobs.push(
      (async () => {
        if (await overQuota(env, 'naver', Number(env.DAILY_NAVER_LIMIT ?? 500))) return;
        const r = await fetchNaver(n).catch(() => null);
        if (r && !r.gone && !r.parseError) out.naver = r;
      })(),
    );
  }
  if (k) {
    jobs.push(
      (async () => {
        if (await overQuota(env, 'kakao', Number(env.DAILY_KAKAO_LIMIT ?? 500))) return;
        const r = await fetchKakao(k).catch(() => null);
        if (r && !r.gone) out.kakao = r;
      })(),
    );
  }
  if (g && env.GOOGLE_PLACES_KEY) {
    jobs.push(
      (async () => {
        // 구글만 돈이 든다. 기본 하루 30 건이면 무료 한도(월 1,000)를 넘지 않는다.
        if (await overQuota(env, 'google', Number(env.DAILY_GOOGLE_LIMIT ?? 30))) return;
        const r = await fetchGoogle(g, env.GOOGLE_PLACES_KEY).catch(() => null);
        if (r && !r.gone) out.google = r;
      })(),
    );
  }

  await Promise.all(jobs);
  return out;
}

export default {
  async fetch(request, env, ctx) {
    const allowed = String(env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const origin = request.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, allowed);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET') return json({ error: 'method' }, 405, cors);
    if (allowed.length && !allowed.includes(origin)) return json({ error: 'origin' }, 403, cors);

    const url = new URL(request.url);
    const q = {
      n: url.searchParams.get('n') ?? '',
      k: url.searchParams.get('k') ?? '',
      g: url.searchParams.get('g') ?? '',
    };
    // ID 는 숫자·영문·하이픈·밑줄만. 그 밖의 값으로 외부 주소를 만들지 않는다.
    for (const [key, v] of Object.entries(q)) {
      if (v && !/^[A-Za-z0-9_-]{1,128}$/.test(v)) return json({ error: `bad ${key}` }, 400, cors);
    }
    if (!q.n && !q.k && !q.g) return json({ error: 'empty' }, 400, cors);

    const cacheKey = `r:${q.n}|${q.k}|${q.g}`;
    const hit = await env.RATINGS.get(cacheKey, 'json');
    if (hit) return json(hit, 200, { ...cors, 'x-cache': 'hit', 'cache-control': 'public, max-age=3600' });

    const out = await collect(env, q);

    // 아무것도 못 받았으면 캐시하지 않는다. 일시적 실패를 30 일 동안 붙들면 안 된다.
    if (Object.keys(out).length) {
      ctx.waitUntil(env.RATINGS.put(cacheKey, JSON.stringify(out), { expirationTtl: TTL }));
    }
    return json(out, 200, { ...cors, 'x-cache': 'miss', 'cache-control': 'public, max-age=3600' });
  },
};
