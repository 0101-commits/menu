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
  // 비어 있으면 막는다. 열어 두면 vars 설정을 빠뜨린 배포에서 아무 사이트나
  // 이 Worker 를 통해 구글 쿼터를 태울 수 있다(키가 새는 건 아니지만 과금은 난다).
  const ok = allowed.length > 0 && allowed.includes(origin);
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

/**
 * 하루 호출 수를 센다. 넘으면 그 소스만 건너뛴다 — 앱 전체를 죽이지 않는다.
 *
 * ⚠ 이건 정확한 상한이 아니다. KV 는 read-modify-write 가 원자적이지 않고 읽기 일관성도
 * 최대 60초 지연되므로, 동시에 N건이 들어오면 N건이 함께 통과할 수 있다.
 * 먼저 올리고 나중에 검사해 낙관적 누락만 줄인다.
 *
 * **요금의 진짜 상한은 Google Cloud 콘솔의 API 일일 할당량(Quotas)에서 걸어야 한다.**
 * 여기 값은 그 앞의 완충일 뿐이다. docs/keys.html 3단계 참고.
 */
async function overQuota(env, key, limit) {
  if (!limit) return false;
  const day = new Date().toISOString().slice(0, 10);
  const k = `quota:${key}:${day}`;
  const used = Number((await env.RATINGS.get(k)) ?? 0);
  await env.RATINGS.put(k, String(used + 1), { expirationTtl: 2 * DAY });
  return used >= limit;
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
        // 미리 채워 둔 값이 있으면 API 를 안 부른다. 채우는 건 scripts/google-fill.mjs 가
        // 하고 wrangler kv bulk put 으로 올린다. 이 키에는 TTL 이 없다 — 있으면 한 달마다
        // 3,613건을 다시 받아야 하고 그게 곧 요금이다.
        const seeded = await env.RATINGS.get(`g:${g}`, 'json');
        if (seeded && !seeded.gone) { out.google = seeded; return; }
        if (seeded?.gone) return; // 사라진 장소. 다시 묻지 않는다.

        // 채워지지 않은 곳(새로 늘어난 가게 등)만 그때그때 받는다.
        // 기본 하루 30 건이면 무료 한도(월 1,000)를 넘지 않는다.
        if (await overQuota(env, 'google', Number(env.DAILY_GOOGLE_LIMIT ?? 30))) return;
        const r = await fetchGoogle(g, env.GOOGLE_PLACES_KEY).catch(() => null);
        if (!r || r.gone) return;
        out.google = r;
        // 받은 김에 같은 자리에 남긴다. 다음부터는 호출이 안 나간다.
        await env.RATINGS.put(`g:${g}`, JSON.stringify({ ...r, at: new Date().toISOString() }));
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
    if (!allowed.length) {
      return json({ error: 'ALLOWED_ORIGINS 가 설정되지 않았습니다' }, 403, cors);
    }
    if (!allowed.includes(origin)) return json({ error: 'origin' }, 403, cors);

    const url = new URL(request.url);

    // 목록용. 미리 채워 둔 구글 평점을 한 덩어리로 돌려준다.
    // 장소마다 부르면 목록 한 번에 수천 번 요청이 된다 — 여기서는 KV 읽기 한 번이다.
    // 이 경로는 구글 API 를 절대 부르지 않는다. 채워진 만큼만 준다.
    if (url.pathname === '/google') {
      const all = await env.RATINGS.get('g:all', 'json');
      return json(all ?? {}, 200, {
        ...cors,
        'x-cache': all ? 'hit' : 'empty',
        'cache-control': 'public, max-age=3600',
      });
    }

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

    // 요청한 소스가 전부 채워졌을 때만 30 일을 준다.
    // 구글 일일 한도가 소진된 뒤의 응답은 {naver, kakao} 뿐인데, 이걸 30 일 캐시하면
    // 그 가게의 구글 평점이 한 달 내내 비어 있게 된다. 부분 결과는 한 시간만 둔다.
    const wanted = [q.n && 'naver', q.k && 'kakao', q.g && env.GOOGLE_PLACES_KEY && 'google'].filter(Boolean);
    const complete = wanted.length > 0 && wanted.every((k) => out[k]);
    if (Object.keys(out).length) {
      ctx.waitUntil(
        env.RATINGS.put(cacheKey, JSON.stringify(out), { expirationTtl: complete ? TTL : 3600 }),
      );
    }
    return json(out, 200, { ...cors, 'x-cache': 'miss', 'cache-control': 'public, max-age=3600' });
  },
};
