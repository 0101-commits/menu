import { useCallback, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Place, RatingsMap } from '../../types';
import type { SourceMeans } from '../../lib/rating';
import { colorOf } from '../../lib/categories';
import { levelForRadius } from '../../lib/geo';
import { numberAssignments, popupCenterShift } from '../../lib/map-geometry';
import { PlaceInfoWindow } from '../PlaceInfoWindow';
import { numberPinSvg } from './markerImages';
import type { KakaoObject, MapRuntime } from './types';
import type { MapFocus } from '../MapView';

const POPUP_SPACE = 224;
const LABEL_SPACE = 84;
const POPUP_GAP = 28;
const MARKER_GAP = 48;

interface Options {
  runtime: MapRuntime;
  status: 'loading' | 'ready' | 'error';
  selectedCategories: string[];
  selectedPlace: Place | null;
  numbered?: string[];
  ratings: RatingsMap;
  means: SourceMeans;
  showGoogle: boolean;
  showPopup: boolean;
  bottomInset: number;
  leftInset: number;
  focus: MapFocus | null;
  onSelect: (place: Place | null) => void;
  onDetail: (place: Place) => void;
  onClearTransient: () => void;
}

export function usePlaceLayers(options: Options) {
  const appliedNumbers = useRef<Map<string, number>>(new Map());
  const numberImages = useRef<Map<string, KakaoObject>>(new Map());
  /** 지금 선택돼 있는 가게. 선택 effect 가 갱신한다. */
  const previousSelected = useRef<Place | null>(null);
  const info = useRef<{ overlay: KakaoObject; root: Root; element: HTMLDivElement } | null>(null);
  const callbacks = useRef({ onSelect: options.onSelect });
  callbacks.current = { onSelect: options.onSelect };

  useEffect(() => {
    if (options.status !== 'ready') return;
    options.runtime.dotLayerRef.current?.setFilter(options.selectedCategories);
  }, [options.selectedCategories, options.status, options.runtime]);

  const numberImage = useCallback((place: Place, number: number) => {
    const kakao = options.runtime.kakaoRef.current;
    const color = colorOf(place.category);
    const key = `${color}:${number}`;
    let image = numberImages.current.get(key);
    if (!image && kakao) {
      image = new kakao.maps.MarkerImage(numberPinSvg(color, number), new kakao.maps.Size(26, 36), {
        offset: new kakao.maps.Point(13, 36),
      });
      numberImages.current.set(key, image);
    }
    return image;
  }, [options.runtime]);

  // 선택에서 풀렸거나 번호가 바뀐 가게를 제자리로 — 번호가 있으면 번호 핀, 없으면 마커를 내리고
  // 캔버스가 다시 점·핀으로 그린다. 번호 핀은 캔버스보다 위 층이라 점에 덮이지 않는다.
  const settle = useCallback((place: Place) => {
    const marker = options.runtime.markerByPlaceId.current.get(place.placeId);
    if (!marker) return;
    const number = appliedNumbers.current.get(place.placeId);
    if (!number) { marker.setMap(null); return; }
    marker.setImage(numberImage(place, number));
    marker.setZIndex(2);
    marker.setMap(options.runtime.mapRef.current);
  }, [options.runtime, numberImage]);

  // 카카오 마커로 따로 띄운 가게(번호·선택)는 캔버스에서 뺀다.
  const syncHidden = useCallback(() => {
    const ids = new Set(appliedNumbers.current.keys());
    if (previousSelected.current) ids.add(previousSelected.current.placeId);
    options.runtime.dotLayerRef.current?.setHidden(ids);
  }, [options.runtime]);

  useEffect(() => {
    if (options.status !== 'ready') return;
    const next = numberAssignments(options.numbered ?? []);
    const touched = new Set([...appliedNumbers.current.keys(), ...next.keys()]);
    appliedNumbers.current = next;
    for (const placeId of touched) {
      if (options.selectedPlace?.placeId === placeId) continue;
      const place = options.runtime.placeById.current.get(placeId);
      if (!place) continue;
      if (next.has(placeId)) options.runtime.markerFor(place);
      settle(place);
    }
    syncHidden();
  }, [options.numbered, options.status, options.selectedPlace, options.runtime, settle, syncHidden]);

  const centerForPopup = useCallback((position: KakaoObject) => {
    const map = options.runtime.mapRef.current;
    const element = options.runtime.mapEl.current;
    if (!map || !element) return;
    map.setCenter(position);
    const space = options.showPopup ? POPUP_SPACE : LABEL_SPACE;
    // 아래 시트가 있으면(모바일) 시트 바로 위에 붙인다. 시트가 없는데 같은 식을 쓰면 화면 맨 아래
    // 가장자리에 붙어 버린다(데스크톱) — 그때는 가운데에서 말풍선·이름표 몫의 절반만 내린다.
    const shiftY = options.bottomInset > 0
      ? popupCenterShift(element.getBoundingClientRect().height, options.bottomInset, space, POPUP_GAP) ?? 0
      : -space / 2;
    // 지도는 화면 전체 폭이라 그냥 가운데면 데스크톱에서 목록·상세 패널 밑에 깔린다.
    // 중심을 왼쪽으로 패널 폭의 절반만큼 옮겨, 가게가 패널 오른쪽 빈 지도의 가운데에 오게 한다.
    const shiftX = -options.leftInset / 2;
    if (!shiftX && !shiftY) return;
    const kakao = options.runtime.kakaoRef.current;
    const projection = map.getProjection?.();
    if (!kakao || !projection) return;
    const point = projection.containerPointFromCoords(position);
    map.setCenter(projection.coordsFromContainerPoint(new kakao.maps.Point(point.x + shiftX, point.y + shiftY)));
  }, [options.runtime, options.bottomInset, options.leftInset, options.showPopup]);

  useEffect(() => {
    const kakao = options.runtime.kakaoRef.current;
    const map = options.runtime.mapRef.current;
    const images = options.runtime.imagesRef.current;
    if (!kakao || !map || !images || options.status !== 'ready') return;

    const previous = previousSelected.current;
    previousSelected.current = options.selectedPlace;
    if (previous) settle(previous);
    syncHidden();

    if (!options.selectedPlace) {
      info.current?.overlay.setMap(null);
      return;
    }

    options.onClearTransient();
    const marker = options.runtime.markerFor(options.selectedPlace);
    marker?.setImage(images.selected.get(colorOf(options.selectedPlace.category)));
    marker?.setZIndex(10);
    marker?.setMap(map);

    const position = new kakao.maps.LatLng(options.selectedPlace.lat, options.selectedPlace.lng);
    centerForPopup(position);
    if (!info.current) {
      // React가 내용을 나중에 그리므로 SDK anchor가 아니라 CSS가 자기 크기로 정렬한다.
      const element = document.createElement('div');
      element.style.position = 'relative';
      info.current = {
        element,
        root: createRoot(element),
        // clickable: 이름표·말풍선을 누른 것이 지도 클릭으로 새면 그 밑의 다른 점이 골라진다.
        overlay: new kakao.maps.CustomOverlay({ position, content: element, xAnchor: 0, yAnchor: 0, zIndex: 20, clickable: true }),
      };
    }
    info.current.overlay.setPosition(position);
    info.current.overlay.setMap(map);
    // 시트를 끄는 동안 계속 선택점으로 튀지 않도록 bottomInset은 별도 effect에서만 처리한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.selectedPlace, options.status]);

  useEffect(() => {
    const kakao = options.runtime.kakaoRef.current;
    if (!kakao || !options.selectedPlace || options.status !== 'ready') return;
    centerForPopup(new kakao.maps.LatLng(options.selectedPlace.lat, options.selectedPlace.lng));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.bottomInset, options.leftInset]);

  useEffect(() => {
    if (!options.selectedPlace || !info.current) return;
    info.current.element.style.transform = `translate(-50%, calc(-100% - ${options.showPopup ? MARKER_GAP : 22}px))`;
    info.current.root.render(options.showPopup ? (
      <PlaceInfoWindow
        place={options.selectedPlace}
        ratings={options.ratings[options.selectedPlace.placeId]}
        means={options.means}
        showGoogle={options.showGoogle}
        onClose={() => callbacks.current.onSelect(null)}
        onDetail={options.onDetail}
      />
    ) : (
      <button
        type="button"
        onClick={() => options.onDetail(options.selectedPlace!)}
        className="max-w-[240px] truncate bg-surface-raised text-fg border border-line shadow-lg rounded-full px-3 min-h-11 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {options.selectedPlace.name}
      </button>
    ));
  }, [
    options.selectedPlace, options.status, options.ratings, options.means,
    options.showGoogle, options.showPopup, options.onDetail, options,
  ]);

  useEffect(() => {
    const kakao = options.runtime.kakaoRef.current;
    const map = options.runtime.mapRef.current;
    if (!kakao || !map || !options.focus) return;
    options.runtime.circleRef.current?.setMap(null);
    options.runtime.circleRef.current = null;
    const center = new kakao.maps.LatLng(options.focus.lat, options.focus.lng);
    if (options.focus.radius > 0) {
      const circle = new kakao.maps.Circle({
        center,
        radius: options.focus.radius,
        strokeWeight: 2,
        strokeColor: '#c8362a',
        strokeOpacity: 0.7,
        strokeStyle: 'shortdash',
        fillColor: '#c8362a',
        fillOpacity: 0.06,
      });
      circle.setMap(map);
      options.runtime.circleRef.current = circle;
      const bounds = circle.getBounds?.();
      if (bounds) map.setBounds(bounds);
      else { map.setCenter(center); map.setLevel(levelForRadius(options.focus.radius)); }
    } else {
      map.setCenter(center);
    }
  }, [options.focus, options.runtime]);

  useEffect(() => () => {
    const current = info.current;
    setTimeout(() => current?.root.unmount(), 0);
  }, []);
}
