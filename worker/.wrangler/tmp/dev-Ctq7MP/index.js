var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../shared/parse-place.mjs
var NAVER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
var KAKAO_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
var DAY_NAMES = ["\uC77C", "\uC6D4", "\uD654", "\uC218", "\uBAA9", "\uAE08", "\uD1A0"];
function parseNaverHours(html) {
  const anchor = html.indexOf('"businessHours":[{"__typename":"WorkingHoursInfo"');
  if (anchor < 0) return null;
  const win = html.slice(anchor, anchor + 6e3);
  const days = win.split('{"__typename":"WorkingHoursInfo"').slice(1, 8);
  if (!days.length) return null;
  const hours = [];
  let baseDay = null;
  for (const seg of days) {
    const dayName = (seg.match(/"day":"(.)/) ?? [])[1];
    if (baseDay === null && dayName) {
      const i = DAY_NAMES.indexOf(dayName);
      if (i >= 0) baseDay = i;
    }
    const span = seg.match(/"businessHours":\{"__typename":"StartEndTime","start":"([^"]*)","end":"([^"]*)"/);
    if (!span) {
      hours.push("");
      continue;
    }
    const brk = seg.match(/"breakHours":\[\{"__typename":"StartEndTime","start":"([^"]*)","end":"([^"]*)"/);
    hours.push(brk ? `${span[1]}~${span[2]} (\uBE0C\uB808\uC774\uD06C ${brk[1]}~${brk[2]})` : `${span[1]}~${span[2]}`);
  }
  if (baseDay === null || !hours.some((h) => h)) return null;
  return { hours, hoursDay: baseDay };
}
__name(parseNaverHours, "parseNaverHours");
function parseNaverMenus(html) {
  const items = [];
  for (const seg of html.split('"__typename":"PlaceMenuItem"').slice(1)) {
    const head = seg.slice(0, 900);
    const name = (head.match(/"name":"([^"]+)"/) ?? [])[1];
    if (!name) continue;
    const priceText = (head.match(/"displayText":"([^"]*)"/) ?? [])[1] ?? "";
    const digits = priceText.replace(/[^\d]/g, "");
    items.push({
      name,
      ...digits ? { price: Number(digits) } : {},
      repr: /"badges":\[[^\]]*"repr"/.test(head)
    });
  }
  if (!items.length) return null;
  const repr = items.filter((m) => m.repr);
  return (repr.length ? repr : items).slice(0, 3).map(({ name, price }) => ({
    name,
    ...price ? { price } : {}
  }));
}
__name(parseNaverMenus, "parseNaverMenus");
function parseNaver(html, sid) {
  if (/"placeDetail\(.{0,400}?\)":null/.test(html)) return { gone: true };
  const anchor = html.indexOf(`"PlaceDetailBase:${sid}"`);
  const win = anchor >= 0 ? html.slice(anchor, anchor + 4e3) : html;
  const num = /* @__PURE__ */ __name((re) => {
    const m = win.match(re);
    if (!m) return void 0;
    return m[1] === "null" ? null : Number(m[1]);
  }, "num");
  const score = num(/"visitorReviewsScore":([\d.]+|null)/);
  const visitors = num(/"visitorReviewsTotal":(\d+|null)/);
  const blogs = num(/"cafeBlogReviewsTotal":(\d+|null)/);
  const keywords = [];
  for (const seg of html.split('"VisitorReviewStatsAnalysisVoteKeywordDetail"').slice(1)) {
    const m = seg.slice(0, 600).match(/"displayName":"([^"]+)","count":(\d+)/);
    if (m) keywords.push({ t: m[1], n: Number(m[2]) });
  }
  keywords.sort((a, b) => b.n - a.n);
  const booking = (html.match(/"naverBookingUrl":"(https:[^"]+)"/) ?? [])[1];
  const showFlag = html.match(/"showVisitorReviewScore":(true|false)/);
  const scoreHidden = showFlag ? showFlag[1] === "false" : void 0;
  if (anchor < 0 && score === void 0 && visitors === void 0) return { parseError: true };
  const hours = parseNaverHours(html);
  const menus = parseNaverMenus(html);
  return {
    ...hours ? hours : {},
    ...menus ? { menus } : {},
    // 0 은 실제 평점이 아니라 "점수 없음" 이다. 방문자 리뷰가 288 개인데 평균이 정확히 0 인
    // 가게가 실측 55 건 나왔고, 0 초과 3 미만은 6 건뿐이었다. 0.0 으로 보여 주면
    // 평점순 바닥에 깔리고 카드에는 거짓말이 찍힌다.
    score: score ? score : null,
    visitors: visitors ?? 0,
    blogs: blogs ?? 0,
    ...scoreHidden ? { scoreHidden: true } : {},
    ...keywords.length ? { keywords: keywords.slice(0, 6) } : {},
    ...booking ? { booking } : {}
  };
}
__name(parseNaver, "parseNaver");
async function fetchNaver(sid, fetchImpl = fetch) {
  const res = await fetchImpl(`https://m.place.naver.com/restaurant/${sid}/home`, {
    headers: { "user-agent": NAVER_UA, "accept-language": "ko-KR,ko;q=0.9" }
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 400 || res.status === 403 || res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseNaver(await res.text(), sid);
}
__name(fetchNaver, "fetchNaver");
function parseKakao(j) {
  const ss = j?.kakaomap_review?.score_set ?? {};
  const sym = j?.ai_mate?.price_level?.symbol;
  const status = j?.summary?.status;
  const regions = (j?.summary?.regions ?? []).reduce((a, r) => ({ ...a, [r.depth]: r.name }), {});
  const days = j?.open_hours?.week_from_today?.week_periods?.[0]?.days ?? [];
  const rawHours = days.map((d) => d?.on_days?.start_end_time_desc ?? "");
  const hours = rawHours.some((h) => h.trim()) ? rawHours : void 0;
  const menus = (j?.menu?.menus?.items ?? []).slice(0, 3).map((m) => ({ name: m.name, price: m.price })).filter((m) => m.name);
  return {
    // 네이버와 같은 이유로 0 은 점수 없음이다(별점 표본 0 이면 평균도 0 으로 온다).
    score: ss.average_score ? ss.average_score : null,
    count: ss.review_count ?? 0,
    blogs: j?.blog_review?.review_count ?? 0,
    ...sym ? { price: sym.length } : {},
    // ₩₩₩₩ → 4
    ...hours ? { hours } : {},
    ...menus.length ? { menus } : {},
    // show_ranking_card 만 보고 만들면 문구도 순위도 없는 빈 rank 가 남아 화면에 글자 없는
    // 알약이 찍힌다. 보여 줄 말이 하나라도 있을 때만 만든다.
    ...j?.trend_rank?.show_ranking_card && (j.trend_rank.display_text?.trim() || j.trend_rank.menu_rank?.rank) ? {
      rank: {
        text: j.trend_rank.display_text?.trim() ?? "",
        ...j.trend_rank.menu_rank?.rank ? { n: j.trend_rank.menu_rank.rank } : {}
      }
    } : {},
    ...status && status !== "Y" ? { closed: true } : {},
    ...regions[1] ? { region: [regions[1], regions[2], regions[3]].filter(Boolean) } : {},
    photos: j?.photos?.counts?.total ?? 0,
    ...j?.summary?.name ? { name: j.summary.name } : {}
  };
}
__name(parseKakao, "parseKakao");
async function fetchKakao(id, fetchImpl = fetch) {
  const res = await fetchImpl(`https://place-api.map.kakao.com/places/panel3/${id}`, {
    headers: {
      "user-agent": KAKAO_UA,
      accept: "application/json",
      pf: "web",
      // 이 헤더가 없으면 404 가 온다
      origin: "https://place.map.kakao.com",
      referer: "https://place.map.kakao.com/"
    }
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 403 || res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseKakao(await res.json());
}
__name(fetchKakao, "fetchKakao");
var GOOGLE_FIELD_MASK = "rating,userRatingCount,priceLevel,regularOpeningHours";
async function fetchGoogle(placeId, apiKey, fetchImpl = fetch) {
  const res = await fetchImpl(`https://places.googleapis.com/v1/places/${placeId}?languageCode=ko`, {
    headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": GOOGLE_FIELD_MASK }
  });
  if (res.status === 404) return { gone: true };
  if (res.status === 429) throw new Error("RATE_LIMIT");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return {
    score: j.rating ?? null,
    count: j.userRatingCount ?? 0,
    // PRICE_LEVEL_INEXPENSIVE … 를 ₩ 개수로 바꾼다.
    ...j.priceLevel ? { price: googlePrice(j.priceLevel) } : {},
    ...typeof j.regularOpeningHours?.openNow === "boolean" ? { open: j.regularOpeningHours.openNow } : {}
  };
}
__name(fetchGoogle, "fetchGoogle");
function googlePrice(level) {
  const map = {
    PRICE_LEVEL_FREE: 1,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4
  };
  return map[level];
}
__name(googlePrice, "googlePrice");

// index.js
var DAY = 86400;
var TTL = 30 * DAY;
var GONE_TTL = 90 * DAY;
var BUILT_AT = "2026-09-21";
var IDS_MAX = 60;
var KV_CONCURRENCY = 20;
var ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
function corsHeaders(origin, allowed) {
  const ok = allowed.length > 0 && allowed.includes(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin || "*" : "null",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin"
  };
}
__name(corsHeaders, "corsHeaders");
var json = /* @__PURE__ */ __name((body, status, headers) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", ...headers }
}), "json");
async function mapLimit(items, limit, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += limit) {
    out.push(...await Promise.all(items.slice(i, i + limit).map(fn)));
  }
  return out;
}
__name(mapLimit, "mapLimit");
function putGoogle(env, gid, value) {
  const at = (/* @__PURE__ */ new Date()).toISOString();
  const gone = Boolean(value.gone);
  return env.RATINGS.put(`g:${gid}`, JSON.stringify({ ...value, at }), {
    metadata: { at, ...gone ? { gone: true } : {} },
    ...gone ? { expirationTtl: GONE_TTL } : {}
  });
}
__name(putGoogle, "putGoogle");
async function overQuota(env, key, limit) {
  if (!limit) return false;
  const day = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const k = `quota:${key}:${day}`;
  const used = Number(await env.RATINGS.get(k) ?? 0);
  await env.RATINGS.put(k, String(used + 1), { expirationTtl: 2 * DAY });
  return used >= limit;
}
__name(overQuota, "overQuota");
var googleLimit = /* @__PURE__ */ __name((env) => Number(env.DAILY_GOOGLE_LIMIT ?? 30), "googleLimit");
async function collect(env, { n, k, g }) {
  const out = {};
  const jobs = [];
  if (n) {
    jobs.push(
      (async () => {
        if (await overQuota(env, "naver", Number(env.DAILY_NAVER_LIMIT ?? 500))) return;
        const r = await fetchNaver(n).catch(() => null);
        if (r && !r.gone && !r.parseError) out.naver = r;
      })()
    );
  }
  if (k) {
    jobs.push(
      (async () => {
        if (await overQuota(env, "kakao", Number(env.DAILY_KAKAO_LIMIT ?? 500))) return;
        const r = await fetchKakao(k).catch(() => null);
        if (r && !r.gone) out.kakao = r;
      })()
    );
  }
  if (g && env.GOOGLE_PLACES_KEY) {
    jobs.push(
      (async () => {
        const seeded = await env.RATINGS.get(`g:${g}`, "json");
        if (seeded && !seeded.gone) {
          out.google = seeded;
          return;
        }
        if (seeded?.gone) return;
        if (await overQuota(env, "google", googleLimit(env))) return;
        const r = await fetchGoogle(g, env.GOOGLE_PLACES_KEY).catch(() => null);
        if (!r) return;
        if (r.gone) {
          await putGoogle(env, g, { gone: true });
          return;
        }
        out.google = r;
        await putGoogle(env, g, r);
      })()
    );
  }
  await Promise.all(jobs);
  return out;
}
__name(collect, "collect");
async function googleByIds(env, url, cors, ctx) {
  const raw = (url.searchParams.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!raw.length) return json({ error: "empty" }, 400, cors);
  if (raw.length > IDS_MAX) return json({ error: `too many ids (max ${IDS_MAX})` }, 400, cors);
  if (!raw.every((id) => ID_RE.test(id))) return json({ error: "bad ids" }, 400, cors);
  const ids = [...new Set(raw)];
  const pairs = await mapLimit(ids, KV_CONCURRENCY, async (id) => [
    id,
    await env.RATINGS.get(`g:${id}`, "json")
  ]);
  const out = {};
  const stale = [];
  const cutoff = Date.now() - Number(env.REFRESH_AFTER_DAYS ?? 30) * 86400 * 1e3;
  for (const [id, v] of pairs) {
    if (!v || v.gone) continue;
    out[id] = v;
    if (!v.at || Date.parse(v.at) < cutoff) stale.push(id);
  }
  if (ctx && stale.length && env.GOOGLE_PLACES_KEY) {
    ctx.waitUntil(refreshSome(env, stale.slice(0, Number(env.VIEW_REFRESH_MAX ?? 5))));
  }
  return json(out, 200, {
    ...cors,
    "x-cache": `${Object.keys(out).length}/${ids.length}`,
    "cache-control": "private, max-age=600"
  });
}
__name(googleByIds, "googleByIds");
var index_default = {
  async fetch(request, env, ctx) {
    const allowed = String(env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const origin = request.headers.get("Origin") ?? "";
    const cors = corsHeaders(origin, allowed);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return json({ error: "method" }, 405, cors);
    if (!allowed.length) {
      return json({ error: "ALLOWED_ORIGINS \uAC00 \uC124\uC815\uB418\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4" }, 403, cors);
    }
    if (!allowed.includes(origin)) return json({ error: "origin" }, 403, cors);
    const url = new URL(request.url);
    if (url.pathname === "/google") return googleByIds(env, url, cors, ctx);
    if (url.pathname === "/health") {
      return json(
        {
          ok: true,
          google: Boolean(env.GOOGLE_PLACES_KEY),
          // 키가 붙었는지만. 값은 절대 안 준다.
          routes: ["/", "/google", "/health"],
          builtAt: BUILT_AT
        },
        200,
        { ...cors, "cache-control": "no-store" }
      );
    }
    const q = {
      n: url.searchParams.get("n") ?? "",
      k: url.searchParams.get("k") ?? "",
      g: url.searchParams.get("g") ?? ""
    };
    for (const [key, v] of Object.entries(q)) {
      if (v && !ID_RE.test(v)) return json({ error: `bad ${key}` }, 400, cors);
    }
    if (!q.n && !q.k && !q.g) return json({ error: "empty" }, 400, cors);
    const cacheKey = `r:${q.n}|${q.k}|${q.g}`;
    const hit = await env.RATINGS.get(cacheKey, "json");
    if (hit) return json(hit, 200, { ...cors, "x-cache": "hit", "cache-control": "public, max-age=3600" });
    const out = await collect(env, q);
    const wanted = [q.n && "naver", q.k && "kakao", q.g && env.GOOGLE_PLACES_KEY && "google"].filter(Boolean);
    const complete = wanted.length > 0 && wanted.every((k) => out[k]);
    if (Object.keys(out).length) {
      ctx.waitUntil(
        env.RATINGS.put(cacheKey, JSON.stringify(out), { expirationTtl: complete ? TTL : 3600 })
      );
    }
    return json(out, 200, { ...cors, "x-cache": "miss", "cache-control": "public, max-age=3600" });
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
  }
};
async function refreshSome(env, gids) {
  for (const gid of gids) {
    if (await overQuota(env, "google", googleLimit(env))) return;
    try {
      const r = await fetchGoogle(gid, env.GOOGLE_PLACES_KEY);
      await putGoogle(env, gid, r.gone ? { gone: true } : r);
    } catch {
    }
  }
}
__name(refreshSome, "refreshSome");
async function refreshOldest(env) {
  if (!env.GOOGLE_PLACES_KEY) return;
  const n = Number(env.DAILY_REFRESH ?? 33);
  if (!(n > 0)) return;
  const candidates = [];
  let cursor;
  do {
    const page = await env.RATINGS.list({ prefix: "g:", cursor });
    for (const k of page.keys) {
      if (k.metadata?.gone) continue;
      candidates.push({ gid: k.name.slice(2), at: k.metadata?.at ?? "" });
    }
    cursor = page.list_complete ? void 0 : page.cursor;
  } while (cursor);
  candidates.sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  const targets = candidates.slice(0, n);
  let ok = 0;
  let gone = 0;
  let failed = 0;
  let quota = 0;
  for (const t of targets) {
    if (await overQuota(env, "google", googleLimit(env))) {
      quota = targets.length - ok - gone - failed;
      break;
    }
    try {
      const r = await fetchGoogle(t.gid, env.GOOGLE_PLACES_KEY);
      await putGoogle(env, t.gid, r.gone ? { gone: true } : r);
      if (r.gone) gone++;
      else ok++;
    } catch {
      failed++;
    }
  }
  console.log(
    `google refresh: \uB300\uC0C1 ${candidates.length}\uAC74 \uC911 ${targets.length}\uAC74 \xB7 \uC131\uACF5 ${ok} \xB7 \uD3D0\uC5C5 ${gone} \xB7 \uC2E4\uD328 ${failed} \xB7 \uD55C\uB3C4\uCD08\uACFC ${quota}`
  );
}
__name(refreshOldest, "refreshOldest");

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-kce8yc/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = index_default;

// ../../AppData/Local/npm-cache/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-kce8yc/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
