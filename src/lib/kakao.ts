// 카카오 지도 SDK 를 감싼다.
//
// 두 가지를 고친다.
//   1) 예전에는 500ms 뒤 한 번만 window.kakao 를 확인하고 없으면 "에러" 로 떨어졌다.
//      느린 망에서는 SDK 가 그 사이에 못 온다. 10초까지 기다린다.
//   2) services 라이브러리의 콜백 API 를 Promise 로 바꾼다. 지오코딩·발견 검색이
//      콜백 중첩 없이 읽히게 하는 게 목적이다.

import type { Discovered } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    kakao: any;
  }
}

export type KakaoNS = any;

let ready: Promise<KakaoNS> | null = null;

/** SDK 가 준비될 때까지 기다린다. 여러 번 불러도 한 번만 기다린다. */
export function loadKakao(timeoutMs = 10000): Promise<KakaoNS> {
  if (ready) return ready;
  ready = new Promise<KakaoNS>((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const k = window.kakao;
      if (k?.maps?.load) {
        k.maps.load(() => resolve(k));
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('KAKAO_SDK_TIMEOUT'));
        return;
      }
      setTimeout(tick, 100);
    };
    tick();
  });
  return ready;
}

export interface PlaceHit {
  id: string;
  name: string;
  address: string;
  roadAddress: string;
  category: string;
  /** 카카오가 준 대분류 코드. SW8=지하철역, AT4=관광명소, FD6=음식점 … */
  groupCode: string;
  lat: number;
  lng: number;
  url: string;
  /** location 을 줬을 때만 채워진다 (m) */
  distance?: number;
}

function toHit(d: any): PlaceHit {
  return {
    id: String(d.id),
    name: d.place_name,
    address: d.address_name ?? '',
    roadAddress: d.road_address_name ?? '',
    category: d.category_name ?? '',
    groupCode: d.category_group_code ?? '',
    lat: Number(d.y),
    lng: Number(d.x),
    url: d.place_url ?? `https://place.map.kakao.com/${d.id}`,
    ...(d.distance ? { distance: Number(d.distance) } : {}),
  };
}

export interface SearchOptions {
  lat?: number;
  lng?: number;
  /** m. 카카오 상한은 20,000 */
  radius?: number;
  groupCode?: string;
  size?: number;
  page?: number;
  sort?: 'distance' | 'accuracy';
}

/** 키워드로 장소 검색. 실패·0건이면 빈 배열. */
export async function keywordSearch(query: string, opts: SearchOptions = {}): Promise<PlaceHit[]> {
  const kakao = await loadKakao();
  const services = kakao.maps.services;
  if (!services?.Places) return [];

  const options: Record<string, unknown> = {
    size: Math.min(opts.size ?? 15, 15),
    page: Math.min(opts.page ?? 1, 45),
  };
  if (opts.lat != null && opts.lng != null) {
    options.location = new kakao.maps.LatLng(opts.lat, opts.lng);
    if (opts.radius) options.radius = Math.min(opts.radius, 20000);
  }
  if (opts.groupCode) options.category_group_code = opts.groupCode;
  if (opts.sort) options.sort = opts.sort === 'distance' ? services.SortBy.DISTANCE : services.SortBy.ACCURACY;

  return new Promise<PlaceHit[]>((resolve) => {
    new services.Places().keywordSearch(
      query,
      (results: any[], status: string) => {
        resolve(status === services.Status.OK && results?.length ? results.map(toHit) : []);
      },
      options,
    );
  });
}

// 지명으로 먼저 읽어야 하는 대분류. "강남역" 이 근처 음식점보다 먼저 잡히게 한다.
const PLACE_LIKE = ['SW8', 'AT4', 'PO3', 'SC4', 'AC5', 'CT1'];

/**
 * "강남역" 같은 지명을 중심 좌표로 바꾼다.
 * 후보를 정렬해 돌려준다 — "시청" 처럼 여러 곳이 나오면 호출부가 사용자에게 고르게 한다.
 */
export async function geocodePlace(query: string): Promise<PlaceHit[]> {
  const hits = await keywordSearch(query, { size: 10 });
  if (hits.length) {
    const ranked = [...hits].sort((a, b) => {
      const ai = PLACE_LIKE.indexOf(a.groupCode);
      const bi = PLACE_LIKE.indexOf(b.groupCode);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });
    return ranked;
  }
  // 키워드로 안 나오면 주소로 본다. "테헤란로 152" 같은 입력.
  const kakao = await loadKakao();
  const services = kakao.maps.services;
  if (!services?.Geocoder) return [];
  return new Promise<PlaceHit[]>((resolve) => {
    new services.Geocoder().addressSearch(query, (results: any[], status: string) => {
      if (status !== services.Status.OK || !results?.length) { resolve([]); return; }
      resolve(
        results.slice(0, 5).map((r) => ({
          id: `addr:${r.x},${r.y}`,
          name: r.address_name,
          address: r.address_name,
          roadAddress: r.road_address?.address_name ?? '',
          category: '주소',
          groupCode: '',
          lat: Number(r.y),
          lng: Number(r.x),
          url: '',
        })),
      );
    });
  });
}

/**
 * 반경 안의 음식점·카페를 찾는다(발견 모드).
 * 페이지당 15건, 최대 3페이지 = 45건. 카카오 상한이 page 45 이지만
 * 목록이 그보다 길어지면 사용자가 못 읽는다.
 */
export async function discoverNearby(
  lat: number,
  lng: number,
  radius: number,
  pages = 3,
): Promise<Discovered[]> {
  const seen = new Set<string>();
  const out: Discovered[] = [];

  for (const groupCode of ['FD6', 'CE7']) {
    for (let page = 1; page <= pages; page++) {
      const hits = await keywordSearch('맛집', { lat, lng, radius, groupCode, page, sort: 'distance', size: 15 });
      if (!hits.length) break;
      for (const h of hits) {
        if (seen.has(h.id)) continue;
        seen.add(h.id);
        out.push({
          kakaoId: h.id,
          name: h.name,
          address: h.roadAddress || h.address,
          category: h.category.split('>').pop()?.trim() ?? '',
          lat: h.lat,
          lng: h.lng,
          url: h.url,
        });
      }
      if (hits.length < 15) break;
    }
  }
  return out;
}
