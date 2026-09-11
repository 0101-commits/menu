# 맛핀 (Matpin)

네이버 지도 즐겨찾기에 저장해 둔 맛집을 지도와 목록에서 찾아보는 앱.

- 대분류 14종(한식·술집·카페·구이·양식·디저트·일식·중식·국물·해산물·분식·면·기타·아시아)으로 필터
- 지도 범위 안에서 검색하거나 전체에서 검색
- 시/도 → 시/군/구 → 동/읍/면 3단 지역 선택
- 가게마다 네이버·카카오·구글 지도로 바로 이동
- 라이트·다크 모드

## 개발

```bash
npm install
npm run dev
```

카카오 지도 SDK 는 도메인이 제한돼 있어 `localhost` 에서는 타일이 뜨지 않는다.
목록·검색·필터는 그대로 동작하고, 배포 도메인에서는 지도도 정상이다.

```bash
npm run typecheck
npm run build
```

## 데이터 동기화

`src/data/places.ts` 는 손으로 고치지 않는다. 즐겨찾기에서 수집해 생성한다.

```bash
cp .env.example .env     # NAVER_COOKIE 채우기
npm run sync
```

`sync` 는 네 단계를 잇는다.

| 단계 | 스크립트 | 하는 일 |
|---|---|---|
| 수집 | `scripts/fetch-myplace.mjs` | 즐겨찾기 폴더 14개에서 전량 수집 (쿠키 필요) |
| 보강 | `scripts/enrich.mjs --only-new` | 신규 장소만 지번 주소·세부 업종 조회 |
| 생성 | `scripts/build-places.mjs` | 정규화·머지·게이트 검사 후 `places.ts` 재생성 |
| 검사 | `npm run typecheck` | |

게이트(수집 건수·place ID 중복·좌표 범위·분류·시도 표기)를 하나라도 통과하지 못하면
`places.ts` 를 쓰지 않고 중단한다. 변경 내역은 `reports/diff-*.md` 로 남는다.

API 실측 기록과 주의사항은 [`docs/myplace-api.md`](docs/myplace-api.md) 에 있다.
`.github/workflows/sync-myplace.yml` 이 주 1회 같은 과정을 돌려 PR 을 연다.

## 디자인

[SEED Design](https://seed-design.io) 을 쓴다. 색·간격·글자 크기의 단일 원천은
[`src/styles/bridge.css`](src/styles/bridge.css) 한 곳이다.

- SEED 의 브랜드 팔레트를 맛핀 핀 레드(`#c8362a`)로 덮는다. 브랜드 토큰이 전부 그 팔레트를
  가리키므로 팔레트만 갈면 전체가 따라온다.
- 컴포넌트는 `--matpin-*` 만 쓰고, `tailwind.config.js` 가 이를 `bg-primary` `text-fg-muted`
  같은 유틸로 노출한다. 컴포넌트에 색 리터럴을 쓰지 않는다.
- 네이버 초록·카카오 노랑·구글 파랑은 외부 서비스 식별색이라 토큰화 대상이 아니다.

## 스택

Vite · React 18 · TypeScript · Tailwind CSS · SEED Design · 카카오 지도 SDK
