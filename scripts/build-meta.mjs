// public/data의 최신성·커버리지 요약을 만든다.
// 원시 키나 응답은 넣지 않고 사용자가 데이터 상태를 판단하는 최소 집계만 공개한다.

import { readFile, writeFile } from 'node:fs/promises';

const places = JSON.parse(await readFile('public/data/places.json', 'utf8'));
const ratings = JSON.parse(await readFile('public/data/ratings.json', 'utf8'));
const values = Object.values(ratings);

const meta = {
  version: 1,
  generatedAt: new Date().toISOString(),
  places: {
    total: places.length,
    withKakaoId: places.filter((place) => Boolean(place.kakaoId)).length,
    withGoogleId: places.filter((place) => Boolean(place.googlePlaceId)).length,
  },
  ratings: {
    total: values.length,
    withNaver: values.filter((rating) => Boolean(rating.naver)).length,
    withKakao: values.filter((rating) => Boolean(rating.kakao)).length,
    // 구글 값은 약관상 공개 ratings.json에 넣지 않는다. 0은 의도된 값이다.
    withGoogle: values.filter((rating) => Boolean(rating.google)).length,
    withHours: values.filter((rating) => Boolean(rating.hours?.length)).length,
    withMenus: values.filter((rating) => Boolean(rating.menus?.length)).length,
  },
};

if (meta.places.total <= 0) throw new Error('meta gate: places가 비었습니다.');
if (meta.ratings.total > meta.places.total) throw new Error('meta gate: ratings가 places보다 많습니다.');

await writeFile('public/data/meta.json', `${JSON.stringify(meta, null, 2)}\n`);
console.log(`meta: 장소 ${meta.places.total} · 평점 ${meta.ratings.total}`);
