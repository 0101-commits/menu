// 온디맨드 평점 조회 Worker.
//
// 하는 일은 넷이다.
//   1) 브라우저가 직접 못 부르는 곳(네이버·카카오 플레이스, CORS 없음)을 대신 부른다.
//   2) 받은 값을 KV 에 둔다. 구글 값(g:)은 TTL 없이 영구 보관하고, 대신 수집 시각(at)을
//      KV metadata 에 같이 적어 "오래된 것부터" 롤링 갱신한다.
//   3) 키를 여기에만 둔다. 프런트 번들에 구글 키가 들어가면 누구나 긁어 쓴다.
//   4) 매일 새벽(cron) 가장 오래된 몇 건만 다시 받는다. 무료 한도 안에서 신선도를 유지한다.
//
// 요청
//   GET /?n={네이버 place ID}&k={카카오 place ID}&g={구글 place ID}
//        셋 다 선택. 있는 것만 조회해서 합쳐 준다.
//   GET /google?ids={구글 place ID 콤마구분, 최대 60}
//        KV 에 이미 있는 것만 돌려준다. 구글 API 를 절대 부르지 않는다(요금 0).
//   GET /health
//        배포본이 어느 버전인지, 구글 키가 붙어 있는지만 알려준다. 키 값은 안 준다.
//
// 없어도 앱은 돈다. 앱은 이 Worker 가 없으면 발견 모드 평점과 구글 칸만 끈다.

import { fetchGoogle, fetchKakao, fetchNaver } from '../shared/parse-place.mjs';

const DAY = 86400;
const TTL = 30 * DAY; // 네이버·카카오 합성 캐시(r:). 구글 값은 여기 해당 없음.
const GONE_TTL = 90 * DAY; // 폐업 표시. 영구로 두면 일시적 404 한 번에 영영 안 뜬다.

// 배포 시점 표식. /health 가 "지금 떠 있는 게 이 코드인가" 에 답하는 유일한 근거다.
const BUILT_AT = '2026-09-21';

const IDS_MAX = 60; // 한 요청에 물을 수 있는 구글 place ID 수
const KV_CONCURRENCY = 20; // 동시에 여는 KV 읽기 수
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

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

// 동시 실행 상한을 둔 map. 60건을 한꺼번에 열면 KV 연결이 몰린다.
async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...(await Promise.all(items.slice(i, i + limit).map(fn))));
  }
  return out;
}

// 구글 값을 KV 에 쓰는 한 곳. 값 안에도 at 을 넣고 metadata 에도 넣는다 —
// 값의 at 은 화면이 "언제 받은 값인지" 적을 때 쓰고,
// metadata 의 at 은 scheduled 가 값을 읽지 않고 "오래된 것" 을 고를 때 쓴다(list 는 공짜로 준다).
function putGoogle(env, gid, value) {
  const at = new Date().toISOString();
  const gone = Boolean(value.gone);
  return env.RATINGS.put(`g:${gid}`, JSON.stringify({ ...value, at }), {
    metadata: { at, ...(gone ? { gone: true } : {}) },
    ...(gone ? { expirationTtl: GONE_TTL } : {}),
  });
}

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

const googleLimit = (env) => Number(env.DAILY_GOOGLE_LIMIT ?? 30);

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
        // 이미 받아 둔 값이 있으면 API 를 안 부른다. 채우는 건 scripts/google-fill.mjs 의
        // 시드와 아래 scheduled 의 롤링 갱신이 한다. 이 키에는 TTL 이 없다 — 있으면
        // 한 달마다 3,613건을 다시 받아야 하고 그게 곧 요금이다.
        const seeded = await env.RATINGS.get(`g:${g}`, 'json');
        if (seeded && !seeded.gone) { out.google = seeded; return; }
        if (seeded?.gone) return; // 사라진 장소. 90일 동안 다시 묻지 않는다.

        // 채워지지 않은 곳(새로 늘어난 가게 등)만 그때그때 받는다.
        // 온디맨드와 롤링 갱신이 같은 카운터를 나눠 쓴다.
        if (await overQuota(env, 'google', googleLimit(env))) return;
        const r = await fetchGoogle(g, env.GOOGLE_PLACES_KEY).catch(() => null);
        if (!r) return;
        // 폐업도 기록한다. 안 남기면 죽은 장소 하나에 매 방문마다 돈이 나간다.
        if (r.gone) { await putGoogle(env, g, { gone: true }); return; }
        out.google = r;
        await putGoogle(env, g, r);
      })(),
    );
  }

  await Promise.all(jobs);
  return out;
}

// GET /google?ids=a,b,c — 미리 받아 둔 구글 값을 있는 것만 돌려준다.
// 프런트가 보내는 건 places.json 의 googlePlaceId 다. 워커는 네이버↔구글 매핑을 모른다.
async function googleByIds(env, url, cors, ctx) {
  const raw = (url.searchParams.get('ids') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return json({ error: 'empty' }, 400, cors);
  if (raw.length > IDS_MAX) return json({ error: `too many ids (max ${IDS_MAX})` }, 400, cors);
  if (!raw.every((id) => ID_RE.test(id))) return json({ error: 'bad ids' }, 400, cors);

  const ids = [...new Set(raw)];
  const pairs = await mapLimit(ids, KV_CONCURRENCY, async (id) => [
    id,
    await env.RATINGS.get(`g:${id}`, 'json'),
  ]);

  const out = {};
  const stale = [];
  const cutoff = Date.now() - Number(env.REFRESH_AFTER_DAYS ?? 30) * 86400 * 1000;
  for (const [id, v] of pairs) {
    if (!v || v.gone) continue; // 없는 것은 키를 빼고 준다
    out[id] = v;
    // 낡은 값은 이번 응답에는 그대로 쓰고(화면이 멈추면 안 된다), 뒤에서 조용히 새로 받는다.
    if (!v.at || Date.parse(v.at) < cutoff) stale.push(id);
  }

  // 본 것만 갱신한다.
  //
  // 원래는 매일 크론이 오래된 것부터 훑을 계획이었는데, 이 계정은 Workers 무료 요금제의
  // cron trigger 5개를 이미 다 쓰고 있다(배포 시 code 10072 로 거절됐다). 그래서 갱신을
  // "사람이 실제로 본 순간" 에 붙였다 — 오히려 이쪽이 낫다. 아무도 안 보는 가게를 갱신하는 데
  // 무료 한도를 쓰지 않고, 보는 가게는 보는 순간 한 번 낡은 채로 보인 뒤 다음부터 새 값이 된다.
  // 한 번에 몇 건만 집는다. 목록 한 장(40건)이 전부 낡았다고 40건을 한꺼번에 태우지 않는다.
  if (ctx && stale.length && env.GOOGLE_PLACES_KEY) {
    ctx.waitUntil(refreshSome(env, stale.slice(0, Number(env.VIEW_REFRESH_MAX ?? 5))));
  }

  return json(out, 200, {
    ...cors,
    'x-cache': `${Object.keys(out).length}/${ids.length}`,
    'cache-control': 'private, max-age=600',
  });
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

    if (url.pathname === '/google') return googleByIds(env, url, cors, ctx);

    if (url.pathname === '/health') {
      return json(
        {
          ok: true,
          google: Boolean(env.GOOGLE_PLACES_KEY), // 키가 붙었는지만. 값은 절대 안 준다.
          routes: ['/', '/google', '/health'],
          builtAt: BUILT_AT,
        },
        200,
        { ...cors, 'cache-control': 'no-store' },
      );
    }

    const q = {
      n: url.searchParams.get('n') ?? '',
      k: url.searchParams.get('k') ?? '',
      g: url.searchParams.get('g') ?? '',
    };
    // ID 는 숫자·영문·하이픈·밑줄만. 그 밖의 값으로 외부 주소를 만들지 않는다.
    for (const [key, v] of Object.entries(q)) {
      if (v && !ID_RE.test(v)) return json({ error: `bad ${key}` }, 400, cors);
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

  /**
   * 롤링 갱신. 매일 새벽에 가장 오래된 몇 건만 다시 받는다.
   *
   * 전량을 한 번에 갱신하는 크론은 못 쓴다 — 3,613곳 × 매달이면 무료 한도(월 1,000)를
   * 세 배 넘는다. 대신 매일 DAILY_REFRESH 건씩 오래된 순서로 돌리면 월 1,000건 안에서
   * 약 넉 달에 한 바퀴를 돈다. 어떤 값도 넉 달보다 낡지 않는다.
   *
   * 오래된 것을 고르는 데 값을 읽지 않는다. list() 가 metadata 를 함께 주므로
   * at 비교는 공짜다(값을 3,613번 읽으면 그것대로 KV 읽기 한도를 먹는다).
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(refreshOldest(env));
  },
};

/** 지정한 구글 place ID 들을 다시 받아 덮어쓴다. 하루 한도 안에서만. */
async function refreshSome(env, gids) {
  for (const gid of gids) {
    if (await overQuota(env, 'google', googleLimit(env))) return;
    try {
      const r = await fetchGoogle(gid, env.GOOGLE_PLACES_KEY);
      await putGoogle(env, gid, r.gone ? { gone: true } : r);
    } catch {
      // 실패한 건은 at 이 그대로라 다음에 볼 때 다시 대상이 된다.
    }
  }
}

async function refreshOldest(env) {
  if (!env.GOOGLE_PLACES_KEY) return; // 키가 없으면 조용히 끝낸다

  const n = Number(env.DAILY_REFRESH ?? 33);
  if (!(n > 0)) return;

  // g: 키를 전부 훑는다. 값은 안 읽는다 — 이름과 metadata 뿐이다.
  const candidates = [];
  let cursor;
  do {
    const page = await env.RATINGS.list({ prefix: 'g:', cursor });
    for (const k of page.keys) {
      if (k.metadata?.gone) continue; // 폐업은 90일 TTL 로 알아서 빠진다. 돈 쓸 이유 없다.
      // metadata.at 이 없는 옛 키는 가장 오래된 것으로 본다.
      candidates.push({ gid: k.name.slice(2), at: k.metadata?.at ?? '' });
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  candidates.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const targets = candidates.slice(0, n);

  let ok = 0;
  let gone = 0;
  let failed = 0;
  let quota = 0;

  for (const t of targets) {
    // 온디맨드와 같은 카운터를 쓴다 — 갱신과 사용자가 하루 한도를 나눠 쓴다.
    if (await overQuota(env, 'google', googleLimit(env))) { quota = targets.length - ok - gone - failed; break; }
    try {
      const r = await fetchGoogle(t.gid, env.GOOGLE_PLACES_KEY);
      await putGoogle(env, t.gid, r.gone ? { gone: true } : r);
      if (r.gone) gone++; else ok++;
    } catch {
      // 한 건이 죽어도 나머지는 계속한다. 실패한 건은 at 이 그대로라 내일 다시 앞에 선다.
      failed++;
    }
  }

  console.log(
    `google refresh: 대상 ${candidates.length}건 중 ${targets.length}건 · 성공 ${ok} · 폐업 ${gone} · 실패 ${failed} · 한도초과 ${quota}`,
  );
}
