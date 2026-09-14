# 맛핀 (Matpin)

네이버 지도 즐겨찾기에 저장해 둔 맛집 4,084곳을 지도와 목록에서 찾아보는 앱.

- **세 지도의 평점을 카드 한 줄에서 비교** — 네이버·카카오·구글. 외부 탭을 열지 않는다.
- **장소로 찾기** — "강남역", "강남역 일식" 처럼 치면 중심점이 잡히고 반경 안에서 고른다.
- **주변 발견** — 저장하지 않은 가게도 같은 화면에서 평점과 함께 본다.
- 영업 중·평점 4.0+·가격대 필터, 평점순·리뷰순·거리순 정렬
- 대분류 14종 필터(6개 색군으로 접을 수 있다), 행정구역 3단 선택
- 모바일 바텀시트 3단, 라이트·다크 모드
- 화면 상태가 URL 에 남는다. 새로고침·뒤로가기·링크 공유가 그대로 된다.

## 개발

```bash
npm install
npm run dev        # http://localhost:5173/menu/
```

```bash
npm run test       # 규칙 자체 검사 (주소 파싱·영업시간·통합 평점·검색·URL)
npm run typecheck
npm run build
```

카카오 지도 SDK 는 **콘솔에 등록한 "도메인:포트" 에서만** 내려온다. 그 밖에서는 401
(`domain mismatched`) 이 오고 지도도 장소 검색도 안 된다. 그래서 dev 포트를 5173 으로
고정했다 — 포트가 밀려나면 조용히 깨지는 대신 시작에서 실패한다.

실측(2026-09-11): `http://localhost:5173` 등록됨 · **`https://0101-commits.github.io` 미등록**.
배포 전에 등록해야 한다. 방법은 [`docs/keys.html`](docs/keys.html).

## 데이터

`public/data/` 두 파일이 화면의 전부다. 손으로 고치지 않고 생성한다.

| 파일 | 내용 | 만드는 것 |
|---|---|---|
| `places.json` | 장소 4,084건 (이름·좌표·지번·행정구역·외부 ID) | `scripts/build-places.mjs` |
| `ratings.json` | 평점·영업시간·메뉴·키워드 리뷰 | `scripts/build-ratings.mjs` |

앱은 시작할 때 `places.json` 을 받고, 목록이 뜬 뒤에 `ratings.json` 을 받아 합친다.
평점 파일이 없어도 목록·지도·검색은 그대로 동작한다.

### 전체 파이프라인

```bash
cp .env.example .env     # 키 채우기 — docs/keys.html
npm run sync
```

| 단계 | 스크립트 | 하는 일 | 키 |
|---|---|---|---|
| 수집 | `fetch-myplace.mjs` | 즐겨찾기 폴더 14개에서 전량 수집 | `NAVER_COOKIE` |
| 보강 | `enrich.mjs --only-new` | 신규 장소만 지번 주소·세부 업종 | — |
| 매칭 | `match.mjs` | 카카오·구글 place ID 를 붙인다 | `KAKAO_REST_KEY`, `GOOGLE_PLACES_KEY`(선택) |
| 생성 | `build-places.mjs` | 정규화·머지·게이트 후 `places.json` | — |
| 평점 | `ratings.mjs` | 네이버·카카오에서 점수 수집 (4,084곳 ≈ 75분) | — |
| 정리 | `build-ratings.mjs` | 게이트 후 `ratings.json` | — |
| 검사 | `npm run test && npm run typecheck` | | |

게이트를 하나라도 통과하지 못하면 파일을 쓰지 않고 중단한다. 리포트는 `reports/` 에 남는다.

카카오 키만 있으면 되는 보강(장소 ID 매칭 + 카카오 평점·영업시간·메뉴)은
GitHub Actions 탭의 **데이터 보강 (카카오)** 를 손으로 돌리면 된다.
주간 동기화와 나눠 둔 이유는, 그쪽이 네이버 계정 쿠키로 시작하는데 그 단계가
Actions 러너 IP 에서 자주 막히기 때문이다.

개별 실행:

```bash
npm run match                              # ID 매칭만
npm run ratings -- --shard=1/4             # 평점 1/4 만 (CI 주간 롤링)
npm run ratings -- --retry-failed          # 파서 고친 뒤 실패분만
node scripts/build-places.mjs --from-existing   # 새 수집 없이 필드만 다시 계산
```

실측 기록과 주의사항:
[`docs/ratings-api.md`](docs/ratings-api.md) (평점 소스) ·
[`docs/myplace-api.md`](docs/myplace-api.md) (즐겨찾기 API)

## 평점을 다루는 규칙

세 소스는 같은 5점 만점이지만 표본 성격이 다르다. 네이버는 영수증·예약 인증이라 표본이 크고
후하게 나오고, 카카오는 표본이 작아 극단값 하나가 평균을 끌어내린다(실측: 리뷰 49건에 평균 3.0).

그래서 **원 점수와 리뷰 수를 항상 함께** 보여 주고, 정렬용 통합 점수만 베이지안 평균으로 보정한다.
표본이 작을수록 그 소스의 전체 평균 쪽으로 당겨져 순위를 흔들지 못한다. 규칙은
[`src/lib/rating.ts`](src/lib/rating.ts), 검사는 `npm run test`.

## 배포

`main` 에 올라가면 [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) 이
GitHub Pages 로 내보낸다. 주소는 `https://0101-commits.github.io/menu/`.

하위 경로 배포라 `vite.config.ts` 의 `base` 가 `/menu/` 다. 다른 곳에 올릴 때는 `VITE_BASE` 로 덮는다.

### 온디맨드 평점 (선택)

`worker/` 의 Cloudflare Worker 를 띄우면 두 가지가 켜진다.

- **주변 발견**의 미저장 가게 평점 (브라우저는 네이버·카카오 플레이스를 직접 못 부른다 — CORS)
- **구글 평점 칸** (구글은 정책상 30일 넘게 저장할 수 없어 미리 채울 수 없다)

없어도 앱은 그대로 돈다. 이 두 가지만 꺼진다. 배포법은 [`worker/wrangler.toml`](worker/wrangler.toml) 주석.

## 디자인

[SEED Design](https://seed-design.io) 을 쓴다. 색·간격·글자 크기의 단일 원천은
[`src/styles/bridge.css`](src/styles/bridge.css) 한 곳이다.

- SEED 의 브랜드 팔레트를 맛핀 핀 레드(`#c8362a`)로 덮는다. 브랜드 토큰이 전부 그 팔레트를
  가리키므로 팔레트만 갈면 전체가 따라온다.
- 컴포넌트는 `--matpin-*` 만 쓰고, `tailwind.config.js` 가 이를 `bg-primary` `text-fg-muted`
  같은 유틸로 노출한다. 컴포넌트에 색 리터럴을 쓰지 않는다.
- 네이버 초록·카카오 노랑·구글 파랑은 외부 서비스 식별색이라 토큰화 대상이 아니다.
- 마커 색군 6종(`src/lib/categories.ts`)은 데이터 인코딩이라 라이트·다크에서 같은 값을 쓴다.
  핀 레드는 "선택됨" 전용이라 색군에 빨강이 없다.

## 스택

Vite · React 18 · TypeScript · Tailwind CSS · SEED Design · 카카오 지도 SDK ·
Cloudflare Workers(선택) · GitHub Pages
