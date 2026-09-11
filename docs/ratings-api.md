# 평점 소스 — 실측 기록

실측일: 2026-09-11
방법: 각 엔드포인트를 직접 호출하고 응답을 뜯어봤다. 파서는 `shared/parse-place.mjs` 한 곳에 있다.

## 결론 먼저

**공식 검색 API 에는 평점이 없다.** 네이버 지역검색 API(`openapi.naver.com/v1/search/local.json`)와
카카오 로컬 REST(`dapi.kakao.com/v2/local/search/keyword.json`) 둘 다 응답에 점수·리뷰 수 필드가 없다.
문서에도 없고 실제 호출에도 없다. 평점이 나오는 경로는 아래 셋뿐이다.

| 소스 | 경로 | 성격 | 비용 |
|---|---|---|---|
| 네이버 | `m.place.naver.com/restaurant/{sid}/home` | 비공식(HTML) | 무료 |
| 카카오 | `place-api.map.kakao.com/places/panel3/{id}` | 비공식(JSON) | 무료 |
| 구글 | Places API (New) `places/{placeId}` | 공식 | Enterprise SKU, 월 1,000건 무료 |

앞의 둘은 비공식이라 언제든 바뀐다. 그래서 실패율을 게이트로 감시하고
(`scripts/build-ratings.mjs`), 값이 없으면 화면에서 "—" 로 조용히 내려앉게 만들었다.

---

## 1. 네이버 — 플레이스 페이지

```
GET https://m.place.naver.com/restaurant/{sid}/home
```

- 인증 불필요. `sid` 는 `places.json` 의 `placeId` 와 같다.
- 업종과 무관하게 `/restaurant/` 로 조회된다(카페·주점 확인). 기존 `scripts/enrich.mjs` 와 같은 경로다.
- 응답 600KB 내외. 필요한 값은 60% 지점에 있어 부분 다운로드로는 못 자른다. `Range` 는 무시된다(200 + 전체 본문).
- 1.0~1.5초 간격을 지킨다. 더 빠르게 하면 막힌다.

### 점수

페이지에 박힌 Apollo 상태의 `PlaceDetailBase:{sid}` 블록 안에 있다.

```jsonc
"PlaceDetailBase:1865051065": {
  "visitorReviewsTotal": 1117,
  "visitorReviewsScore": 4.53,
  "cafeBlogReviewsTotal": 173
}
```

**반드시 `PlaceDetailBase:{sid}` 를 앵커로 잡고 그 안에서만 찾아야 한다.**
문서 전체를 훑으면 주변 추천 블록에 실린 다른 업체의 점수를 집는다.

네이버는 2021-10 에 별점 UI 를 없앴지만 데이터는 계속 내려온다(영수증·예약 인증 리뷰의 평균).
노출 정책이 바뀐 필드라 `null` 인 업체가 있다. 실측 표본에서 0.4% 수준. 이때는 점수 없이
방문자 수·블로그 수만 쓴다.

### 키워드 리뷰

네이버가 별점 대신 내세우는 것. `VisitorReviewStatsAnalysisVoteKeywordDetail` 마다
`displayName` 과 `count` 가 있다.

```
"음식이 맛있어요" 3758 · "재료가 신선해요" 2479 · "고기 질이 좋아요" 244 …
```

**`keywordList` 는 쓰지 않는다.** 그건 업주가 등록한 검색 키워드라 뜻이 다르고
(`"수제버거혼밥치맥직장인단체회식"` 같은 키워드 스터핑이 그대로 들어온다),
문서 어디에나 있어서 다른 장소의 값을 집기 쉽다.

### 사라진 장소

즐겨찾기에는 남아 있지만 네이버 플레이스에서 없어진 곳이 있다. 이때 **HTTP 200 이 오고**
Apollo 상태의 `placeDetail(...)` 만 `null` 이다.

```
__APOLLO_STATE__ = {"ROOT_QUERY":{"placeDetail({\"input\":{...}})":null, …}}
```

파싱 실패로 세면 실패율 게이트가 엉뚱하게 울린다. 폐업으로 분류한다.
실측 표본 1,206건 중 9건이 여기 해당했다.

### 상태 코드

`400`·`403`·`429` 는 전부 레이트리밋 신호로 다룬다. `400` 을 "없는 장소" 로 해석하면
데이터를 조용히 날린다(`docs/myplace-api.md` 의 요약 API 차단 실측 참고).

---

## 2. 카카오 — 플레이스 패널

```
GET https://place-api.map.kakao.com/places/panel3/{id}
헤더: pf: web
      origin: https://place.map.kakao.com
      referer: https://place.map.kakao.com/
```

- 인증 불필요. `pf: web` 헤더가 없으면 404 가 온다.
- 응답 61KB 내외 JSON.
- `id` 는 카카오 place ID. `scripts/match.mjs` 가 붙인다.

### 쓰지 않는 것

| 경로 | 결과 |
|---|---|
| `place.map.kakao.com/main/v/{id}` | **404 — 폐기됐다.** 커뮤니티 글은 아직 이 경로를 소개하니 주의 |
| `place.map.kakao.com/{id}` | SPA 셸(3.5KB). 데이터 없음 |
| `place-api.map.kakao.com/places/search` | 404 |

### 응답에서 쓰는 것

최상위 키: `menu`, `visitor`, `summary`, `open_hours`, `photos`, `blog_review`,
`kakaomap_review`, `trend_rank`, `place_badge`, `ai_mate`, `find_way`, …

```jsonc
{
  "kakaomap_review": {
    "score_set": { "average_score": 3, "review_count": 49, "total_score": 145, "photo_count": 26 }
  },
  "blog_review": { "review_count": 370 },
  "ai_mate":   { "price_level": { "symbol": "₩₩₩₩" } },
  "summary":   { "status": "Y", "name": "자매수산",
                 "regions": [{ "depth": 1, "name": "서울" }, { "depth": 2, "name": "강남구" }] },
  "open_hours": { "week_from_today": { "week_periods": [ { "days": [
      { "on_days": { "start_end_time_desc": "14:00 ~ 24:00" } }, … ] } ] } },
  "menu":      { "menus": { "items": [ { "name": "대광어회", "price": 55000 } ] } },
  "trend_rank": { "show_ranking_card": true, "display_text": "강남구 회 인기 맛집",
                  "menu_rank": { "rank": 5 } },
  "photos":    { "counts": { "total": 1261 } }
}
```

- `open_hours` 의 배열은 **오늘부터 앞으로 7일**이다. 어제가 없다. 자정을 넘겨 여는 가게를
  새벽에 판정할 때는 오늘의 마감 시각을 그대로 쓴다(`src/lib/hours.ts`).
- `summary.status !== "Y"` 면 폐업·휴업으로 본다.
- 카카오 별점은 표본이 작다. 실측 예: 블로그 리뷰 370건인 가게의 별점 표본이 49건, 평균 3.0.
  1점 리뷰 하나가 평균을 크게 끌어내린다. 그래서 점수만 크게 보이면 안 되고
  표본 수를 항상 같이 보여준다.

---

## 3. 구글 — Places API (New)

```
GET https://places.googleapis.com/v1/places/{placeId}?languageCode=ko
헤더: X-Goog-Api-Key, X-Goog-FieldMask
```

필드가 SKU 를 정한다. 이 프로젝트의 fieldMask 는 고정이다.

```
rating,userRatingCount,priceLevel,regularOpeningHours   → Place Details Enterprise
```

| SKU | $/1,000 | 월 무료 | 여기서 |
|---|---:|---:|---|
| Text Search Essentials (IDs Only) | 0 | 무제한 | — (이름 확인이 안 돼 안 쓴다) |
| Text Search Pro | 32.00 | 5,000 | 매칭 1회(4,084건) → 무료 안 |
| **Place Details Enterprise** | **20.00** | **1,000** | **평점 조회** |
| Place Details Enterprise + Atmosphere | 25.00 | 1,000 | 비채택 (`reviews` 넣으면 여기로 올라간다) |

두 가지 제약이 설계를 정했다.

- **30일 캐시 상한.** place ID 는 무기한 저장할 수 있지만 `rating` 등은 30일을 넘겨 저장할 수 없다.
  4,084곳을 매달 전량 갱신하면 (4,084 − 1,000) × $0.02 ≈ **$62/월**. 그래서 정적 파일에 넣지 않고
  실제로 열어 본 가게만 Worker 가 받아 KV 에 30일 둔다.
- **표기 의무.** 구글 데이터를 보이는 화면에는 "Google" 표기가 있어야 한다. 상세 시트 하단에 있다.

무료 한도 안에서만 쓰더라도 **결제수단(카드) 등록이 필요하다.** 등록하지 않으면 구글 칸은
꺼진 채로 두고 네이버·카카오 두 소스로 동작한다(`docs/keys.html`).

---

## 4. 매칭 — 어느 ID 가 어느 가게인가

우리 데이터의 유일한 외부 키는 네이버 place ID 뿐이다. 카카오·구글 평점을 붙이려면
각자의 ID 를 먼저 찾아야 한다. `scripts/match.mjs` 가 한다.

오매칭이 가장 나쁜 실패다 — 다른 가게의 평점이 붙는다. 그래서 이름과 거리가 함께 맞을 때만
채택하고 애매하면 비운다.

| 판정 | 조건 |
|---|---|
| high | 정규화한 이름이 같고 80m 이내 |
| medium | 이름이 같고 300m 이내, 또는 30m 이내이고 업종 대분류가 같음 |
| (채택 안 함) | 그 밖 |

이름 정규화는 공백·괄호·기호를 지우고 지점 접미사(`본점`·`3호점`·`강남점`)를 한 번만 떼어 낸다.
medium 목록은 `reports/match-*.md` 에 남는다. 틀린 게 있으면 `raw/match.json` 에서
해당 항목의 `kakaoId` 를 지우면 다음 빌드부터 비워진다.

---

## 5. 수집 운영

```
npm run match          # 카카오·구글 ID 붙이기 (키 필요, 1회)
npm run ratings        # 평점 수집 (네이버는 키 없이도 된다)
npm run build:data     # public/data/*.json 생성 + 게이트
```

- `scripts/ratings.mjs` 는 재개 가능하다. 끊겨도 `raw/ratings.json` 에 남고 다시 돌리면 이어 받는다.
- 기본은 30일보다 오래된 것만 다시 받는다(`--refresh=30`). CI 는 `--shard=N/4` 로 주당 1/4 씩 돈다.
- 파서를 고친 뒤에는 `--retry-failed` 로 실패분만 다시 받아 재분류한다.
- 4,084곳 전량 수집은 1.05초 간격으로 약 75분 걸린다.

### 게이트

`scripts/build-ratings.mjs` 가 검사하고, 하나라도 통과 못 하면 `ratings.json` 을 쓰지 않는다.

| 항목 | 기준 |
|---|---|
| 네이버 파싱 실패율 | < 1% |
| 카카오 파싱 실패율 | < 1% |
| 평점 보유 장소 | ≥ 1건 |

실패율이 오르면 파서가 아니라 페이지 구조가 바뀐 것이다. 이 문서를 먼저 갱신한다.
