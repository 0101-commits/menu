import type { MutableRefObject, RefObject } from 'react';
import type { Place } from '../../types';
import type { KakaoNS } from '../../lib/kakao';
import type { MarkerImages } from './markerImages';
import type { DotLayer } from './dotLayer';

/* Kakao Maps SDK는 공식 TS 타입을 제공하지 않아 SDK 객체 경계에서만 unknown 대신 any를 허용한다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KakaoObject = any;

export interface MapRuntime {
  mapEl: RefObject<HTMLDivElement>;
  kakaoRef: MutableRefObject<KakaoNS | null>;
  mapRef: MutableRefObject<KakaoObject | null>;
  imagesRef: MutableRefObject<MarkerImages | null>;
  dotLayerRef: MutableRefObject<DotLayer | null>;
  placeById: MutableRefObject<Map<string, Place>>;
  /** 지금까지 만든 카카오 마커(번호 핀·선택 핀). 지도에 올라가 있지 않은 것도 있다. */
  markerByPlaceId: MutableRefObject<Map<string, KakaoObject>>;
  /** 그 가게의 카카오 마커. 없으면 만들어 두고 돌려준다(지도에는 아직 안 올린다). */
  markerFor: (place: Place) => KakaoObject | null;
  circleRef: MutableRefObject<KakaoObject | null>;
  suppressClick: MutableRefObject<boolean>;
}
