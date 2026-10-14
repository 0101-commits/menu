// 다른 앱에서 맛핀으로 「공유」한 글·링크에서 저장한 가게를 찾는다.
//
// 설치한 웹앱의 공유 받기(manifest share_target, 안드로이드 크롬·삼성 인터넷)가 시작 주소에
// ?title=&text=&url= 을 붙여 연다. 지도 앱이 보내는 글은 대개 이렇다.
//   네이버 지도  "[네이버지도]\n백나예김밥\n경기 성남시 …\nhttps://naver.me/xxxx"
//   카카오맵    "[카카오맵] 백나예김밥\n경기 성남시 …\nhttps://kko.to/xxxx"
// 짧은 주소(naver.me·kko.to)는 브라우저에서 풀 수 없어(다른 도메인 응답을 못 읽음) 이름 줄로 찾는다.
// 긴 주소에 장소 번호가 있으면 그게 가장 정확하다.
//
// 이름만 보고 열면 안 된다. 저장 안 한 가게를 공유하는 게 이 기능의 주된 쓰임인데, 4,084곳으로
// 시험해 보니 이름이 같은 다른 지점·이름이 겹치는 다른 가게를 191곳(4.7%) 열었다. 그래서 글에 주소가
// 있으면 구·동이 맞을 때만 열고, 주소가 없으면 이름이 정확히 같은 가게가 하나일 때만 연다.
// 나머지는 검색으로 넘긴다 — 틀린 가게를 보여 주는 것보다 그 이름으로 찾아 주는 편이 낫다.

import type { Place } from '../types';

export type ShareMatch = { kind: 'place'; place: Place } | { kind: 'search'; text: string } | null;

/** 공유로 열렸으면 받은 글을 한 덩어리로. 아니면 null. */
export function readShare(search: string = window.location.search): string | null {
  const params = new URLSearchParams(search);
  const parts = ['title', 'text', 'url'].map((key) => params.get(key)?.trim()).filter(Boolean);
  return parts.length ? parts.join('\n') : null;
}

const NAVER_ID = /naver\.com\/\S*?\/(\d{5,})(?=[/?#\s]|$)|naver\.com\/\S*?[?&]placeId=(\d{5,})/;
const KAKAO_ID = /(?:place\.map\.kakao\.com\/(?:m\/)?|[?&]itemId=|map\.kakao\.com\/link\/map\/)(\d{5,})/;
/** 제목 칸에 앱 이름만 오는 경우가 있다. 그 줄로 검색하면 엉뚱한 결과가 나온다. */
const APP_NAME = /^(카카오\s*맵|kakao\s*map|네이버\s*지도|naver\s*map|네이버|구글\s*지도|google\s*maps?)$/i;
/** 주소 줄이 있는지. "서울 강남구 …" "경기 성남시 분당구 …" */
const ADDRESS = /[가-힣]+(?:시|군|구)\s/;

export function matchShared(shared: string, places: Place[]): ShareMatch {
  const id = shared.match(NAVER_ID);
  const naverId = id?.[1] ?? id?.[2];
  const kakaoId = shared.match(KAKAO_ID)?.[1];
  const byId = places.find((place) =>
    (naverId && place.placeId === naverId) || (kakaoId && place.kakaoId === kakaoId));
  if (byId) return { kind: 'place', place: byId };

  // 링크와 앱 꼬리표("[카카오맵]")를 뺀 줄들. 첫 줄이 대개 가게 이름이다.
  const lines = shared
    .split(/\n/)
    .map((line) => line.replace(/https?:\/\/\S+/g, '').replace(/^\s*\[[^\]]*\]\s*/, '').trim())
    .filter((line) => line.length >= 2 && !APP_NAME.test(line));

  const hasAddress = ADDRESS.test(shared);
  const sameDong = (place: Place) => Boolean(place.dong) && shared.includes(place.dong);
  const sameGu = (place: Place) => {
    const gu = place.sigungu.split(' ').pop();
    return Boolean(gu) && shared.includes(gu!);
  };

  for (const line of lines) {
    const exact = places.filter((place) => place.name === line);
    // 지점명이 붙어 오는 경우("오토김밥 신사직영점") — 줄 안에 든 가장 긴 저장 이름.
    let candidates = exact;
    if (!candidates.length) {
      const inside = places.filter((place) => place.name.length >= 3 && line.includes(place.name));
      const longest = Math.max(0, ...inside.map((place) => place.name.length));
      candidates = inside.filter((place) => place.name.length === longest);
    }
    if (!candidates.length) continue;

    const place = hasAddress
      ? candidates.find(sameDong) ?? candidates.find(sameGu)
      : exact.length === 1 ? exact[0] : undefined;
    return place ? { kind: 'place', place } : { kind: 'search', text: line.slice(0, 40) };
  }

  return lines[0] ? { kind: 'search', text: lines[0].slice(0, 40) } : null;
}
