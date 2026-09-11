# 네이버 MyPlace 즐겨찾기 API — 실측 기록

실측일: 2026-09-11
방법: 로그인된 Chrome에서 `https://map.naver.com/p/favorite/myPlace` 열고 네트워크 관찰 → 즐겨찾기 목록이 iframe(`pages.map.naver.com/save-pages`)에 있음을 확인 → 해당 오리진에서 API 직접 호출

## 베이스

```
https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/
```

인증은 네이버 로그인 쿠키(`NID_AUT` / `NID_SES`)로만. 별도 토큰·헤더 불필요.
미로그인 시 `nid.naver.com/nidlogin.login`으로 리다이렉트된다.

## 1. 폴더 목록

```
GET /save-pages/api/maps-bookmark/v3/folders?start=0&limit=20&sort=lastUseTime&folderType=all
```

- `limit`은 **20이 상한**. `limit=100`은 HTTP 400 (`apiErrorCode: 1002`)
- `start`로 페이지네이션이 **실제로 동작한다**

응답:

```jsonc
{
  "count": 38,              // 전체 폴더
  "myFolderCount": 21,      // 내가 만든 리스트
  "followFolderCount": 17,  // 팔로우한 남의 리스트
  "folders": [
    {
      "folderId": 76616765,
      "name": "한식",
      "bookmarkCount": 735,
      "folderType": "MY",   // "MY" | "FOLLOW"
      "shareId": "...",
      "creationTime": 1516467804000,
      "lastUseTime": 1786784719000,
      "isDefaultFolder": false
      // colorCode, iconId, markerColor, publicationStatus, ... 생략
    }
  ]
}
```

## 2. 폴더별 장소 목록 ★ 주력 엔드포인트

```
GET /save-pages/api/maps-bookmark/v3/folders/{folderId}?start=0&limit=20
```

- **`start`·`limit`이 무시된다.** 735건 폴더에서 `start=0`과 `start=20` 모두 735건 전량을 반환하고 두 결과가 완전히 동일(overlap 735). 즉 **폴더당 요청 1회로 전량 수집**
- 응답이 크다. 735건 폴더 기준 직렬화에 20초 이상 걸린다 → 수집기에서 타임아웃 여유를 둘 것

응답:

```jsonc
{
  "folder": { /* 1번과 같은 폴더 객체 */ },
  "bookmarkList": [ /* 아래 항목 */ ],
  "removed": false
}
```

항목(`type: "place"`):

```jsonc
{
  "bookmarkId": 4777744912,
  "sid": "1727073210",          // ★ 네이버 place ID (naverUrl 끝 숫자와 동일)
  "name": "금계리",
  "displayName": "",
  "px": 126.9648182,            // ★ 경도 (lng)
  "py": 37.4013255,             // ★ 위도 (lat)
  "address": "서울 송파구 동남로4길 16-1",  // ⚠ 도로명 주소
  "mcid": "GENERAL",
  "mcidName": "BAR",            // ⚠ 대분류 수준. places.ts의 165종 세분류가 아님
  "rcode": "02173102",          // 법정동 코드
  "cidPath": ["225111", "225131", "225336"],
  "type": "place",              // "place" | "busStop" | ...
  "memo": null,
  "url": null,
  "available": true,
  "creationTime": 1788318407000,
  "useTime": 1788318408000,
  "lastUpdateTime": 1788318408000,
  "order": 65535,
  "isIndoor": true,
  "bookmarkMismatchInfo": { "isMatched": true, "details": ["AVAILABLE"] }
}
```

한식 폴더 735건 표본 검사: `sid` 결손 0건, `px`/`py` 결손 0건, `type`은 전부 `place`.

## 3. 전체 북마크 (폴더 무관)

```
GET /save-pages/api/maps-bookmark/v3/bookmarks?folderId={아무값}&start=0&limit=20
```

- `folderId`·`start`·`limit` **전부 무시**되고 계정의 전체 북마크 4,694건을 반환
- 폴더 정보가 없고 `busStop` 등 장소 아닌 항목이 섞여 있어 이번 용도에는 부적합
- `allCount: 4694` / `placeCount: 4690` / `movementCount: 4` / `mismatchedCount: 10`

## 4. 쓰지 않는 것

| 경로 | 결과 |
|---|---|
| `/folders/{id}/bookmarks` | HTML(SPA 셸) 반환 — API 아님 |
| `/folders?limit=100` | HTTP 400 |

## 실측된 폴더 구성

### 내가 만든 리스트 21개 · 4,692건

places.ts의 대분류 14종과 **이름이 정확히 1:1로 맞는다.** 별칭 매핑표가 필요 없다.

| 폴더 | 네이버 | places.ts | 차이 |
|---|---:|---:|---:|
| 한식 | 735 | 728 | +7 |
| 술집 | 608 | 595 | +13 |
| 카페 | 463 | 468 | −5 |
| 구이 | 450 | 433 | +17 |
| 양식 | 355 | 345 | +10 |
| 디저트 | 336 | 324 | +12 |
| 일식 | 283 | 274 | +9 |
| 중식 | 199 | 201 | −2 |
| 국물 | 177 | 156 | +21 |
| 해산물 | 140 | 127 | +13 |
| 분식 | 109 | 108 | +1 |
| 면 | 84 | 67 | +17 |
| 기타 | 80 | 73 | +7 |
| 아시아 | 70 | 68 | +2 |
| **소계** | **4,089** | **3,967** | **+122** |

### 맛집이 아닌 내 폴더 7개 · 603건

`관광지` 234 · `숙소` 218 · `N/G` 77 · `상점` 43 · `헬스케어` 18 · `내 장소` 8 · `PJT` 5

places.ts에 대응하는 대분류가 없다. **수집 대상에서 제외한다**(미결정 시 기본값).

### 팔로우 리스트 17개 · 3,478건

남이 만든 공개 리스트(미쉐린 가이드, 흑백요리사 출연 셰프, 메르의 식당 등). 내 저장분이 아니므로 **수집 대상에서 제외한다**.

## 수집 대상 확정

`folderType === "MY"` 이면서 이름이 대분류 14종에 속하는 폴더만. 요청 14회로 4,089건 전량.

## 보강이 필요한 필드 2개와 그 소스

| 필드 | 즐겨찾기 API 값 | 필요한 값 | 해결 |
|---|---|---|---|
| `address` | 도로명 `"서울 송파구 동남로4길 16-1"` | 지번 | 아래 플레이스 페이지 |
| `mcidName` | `"음식점"` `"BAR"` 수준 | `"카페,디저트"` 급 세분류 | 아래 플레이스 페이지 |

`address`가 지번이어야 하는 이유는 `PlaceList`의 시/도–시군구–동 3단 필터가 `address.split(' ')`로 토큰을 뽑기 때문이다. 도로명이면 3번째 토큰이 `"동남로4길"`이 되어 동 필터가 깨진다.

### 쓰는 것: `m.place.naver.com`

```
GET https://m.place.naver.com/restaurant/{sid}/home
```

- 인증 불필요
- **업종과 무관하게 `/restaurant/` 경로로 조회된다.** 카페(`"category":"카페,디저트"`)·주점 확인. `/place/`는 302, `/cafe/`는 404
- 응답은 657KB 내외의 HTML. 삽입된 JSON에서 첫 `"address"`(지번)와 `"category"`를 집는다. 두 번째 `"address"`는 UI 라벨(`"주소"`)이므로 첫 값만 유효하다

### 쓰지 않는 것: `map.naver.com/p/api/place/summary/{sid}`

같은 값을 깔끔한 JSON으로 주고 인증도 필요 없지만, **연속 호출에 IP 차단이 걸린다.**

실측: 동시성 3·간격 250ms로 약 300건을 받은 뒤부터 전 요청이 HTTP 400(빈 본문)으로 바뀌었다. 이미 성공했던 ID를 다시 요청해도 400이므로 장소별 문제가 아니다. 60초 쉬고 3초 간격으로 재시도해도 400이 유지됐고, 로그인된 브라우저에서 열면 403이 떴다. **400을 "조회 불가"로 해석하면 안 된다 — 레이트리밋 신호다.**

### 보강 범위

`--only-new`가 기본이다. `places.ts`에 이미 있는 장소는 지번 주소와 세분류를 이미 갖고 있으므로 다시 받을 이유가 없다.

기존 3,967건의 주소 품질을 실측한 결과 **3,966건이 이미 시/도 풀네임 지번**이고 축약 1건은 매핑으로 해결된다. 시/도로 시작하지 않는 주소는 0건이었다. 즉 오염되어 보였던 주소(`"마곡동 …"`, `"전남광주 …"`)는 전부 즐겨찾기 API가 주는 도로명 쪽 문제였다.

전량 보강을 시도할 이유가 없고, 시도하면 위 IP 차단을 부른다.

## 시/도 표기 정규화

즐겨찾기·플레이스 모두 시/도를 축약해서 준다(`"서울"`, `"경기"`). 기존 데이터는 풀네임(`"서울특별시"`)이라 섞이면 지역 필터 드롭다운이 중복된다. `scripts/build-places.mjs`의 `SIDO` 표가 21개 변형을 17개 공식 명칭으로 접는다.

적용 후 실측: 시/도 드롭다운 **17종, 중복 0**.

## 남은 주소 한계 (0.22%)

최종 4,084건 중 9건은 3번째 토큰이 동/읍/면이 아니다.

- 2건은 세종특별자치시 — 시/군/구가 없는 2단 구조라 정상
- 7건은 네이버 플레이스가 지번 없이 도로명만 제공하는 경우 (`광주광역시 북구 서방로159번길 47` 등)

`parseAddress`가 단순 split이라 4토큰 주소(`경기도 수원시 팔달구 신풍동`)에서도 3번째가 `"팔달구"`가 된다. 이건 기존부터 있던 UI 쪽 한계로, 데이터가 아니라 `PlaceList`에서 고칠 문제다.
