import type { MutableRefObject, RefObject } from 'react';
import type { Place } from '../../types';
import type { KakaoNS } from '../../lib/kakao';
import type { MarkerImages } from './markerImages';

/* Kakao Maps SDK는 공식 TS 타입을 제공하지 않아 SDK 객체 경계에서만 unknown 대신 any를 허용한다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type KakaoObject = any;

export interface MapRuntime {
  mapEl: RefObject<HTMLDivElement>;
  kakaoRef: MutableRefObject<KakaoNS | null>;
  mapRef: MutableRefObject<KakaoObject | null>;
  imagesRef: MutableRefObject<MarkerImages | null>;
  markersRef: MutableRefObject<{ marker: KakaoObject; place: Place }[]>;
  markerByPlaceId: MutableRefObject<Map<string, KakaoObject>>;
  clustererRef: MutableRefObject<KakaoObject | null>;
  circleRef: MutableRefObject<KakaoObject | null>;
  suppressClick: MutableRefObject<boolean>;
}
