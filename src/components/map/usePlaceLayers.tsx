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
  focus: MapFocus | null;
  onSelect: (place: Place | null) => void;
  onDetail: (place: Place) => void;
  onClearTransient: () => void;
}

export function usePlaceLayers(options: Options) {
  const appliedNumbers = useRef<Map<string, number>>(new Map());
  const numberImages = useRef<Map<string, KakaoObject>>(new Map());
  const previousSelected = useRef<Place | null>(null);
  const info = useRef<{ overlay: KakaoObject; root: Root; element: HTMLDivElement } | null>(null);
  const callbacks = useRef({ onSelect: options.onSelect });
  callbacks.current = { onSelect: options.onSelect };

  useEffect(() => {
    const clusterer = options.runtime.clustererRef.current;
    if (!clusterer || !options.runtime.markersRef.current.length) return;
    const all = options.runtime.markersRef.current.map((item) => item.marker);
    const visible = options.runtime.markersRef.current
      .filter(({ place }) => !options.selectedCategories.length || options.selectedCategories.includes(place.category))
      .map((item) => item.marker);
    clusterer.removeMarkers(all, true);
    clusterer.addMarkers(visible);
  }, [options.selectedCategories, options.status, options.runtime]);

  const baseImage = useCallback((place: Place) => {
    const kakao = options.runtime.kakaoRef.current;
    const images = options.runtime.imagesRef.current;
    if (!kakao || !images) return null;
    const number = appliedNumbers.current.get(place.placeId);
    const color = colorOf(place.category);
    if (!number) return images.normal.get(color);
    const key = `${color}:${number}`;
    let image = numberImages.current.get(key);
    if (!image) {
      image = new kakao.maps.MarkerImage(numberPinSvg(color, number), new kakao.maps.Size(26, 36), {
        offset: new kakao.maps.Point(13, 36),
      });
      numberImages.current.set(key, image);
    }
    return image;
  }, [options.runtime]);

  useEffect(() => {
    if (options.status !== 'ready' || !options.runtime.imagesRef.current) return;
    const next = numberAssignments(options.numbered ?? []);
    const placeById = new Map(options.runtime.markersRef.current.map((item) => [item.place.placeId, item.place]));
    const touched = new Set([...appliedNumbers.current.keys(), ...next.keys()]);
    appliedNumbers.current = next;
    for (const placeId of touched) {
      if (options.selectedPlace?.placeId === placeId) continue;
      const place = placeById.get(placeId);
      const marker = options.runtime.markerByPlaceId.current.get(placeId);
      if (place && marker) marker.setImage(baseImage(place));
    }
  }, [options.numbered, options.status, options.selectedPlace, options.runtime, baseImage]);

  const centerForPopup = useCallback((position: KakaoObject) => {
    const map = options.runtime.mapRef.current;
    const element = options.runtime.mapEl.current;
    if (!map || !element) return;
    map.setCenter(position);
    const shift = popupCenterShift(
      element.getBoundingClientRect().height,
      options.bottomInset,
      options.showPopup ? POPUP_SPACE : LABEL_SPACE,
      POPUP_GAP,
    );
    if (shift == null || shift === 0) return;
    const kakao = options.runtime.kakaoRef.current;
    const projection = map.getProjection?.();
    if (!kakao || !projection) return;
    const point = projection.containerPointFromCoords(position);
    map.setCenter(projection.coordsFromContainerPoint(new kakao.maps.Point(point.x, point.y + shift)));
  }, [options.runtime, options.bottomInset, options.showPopup]);

  useEffect(() => {
    const kakao = options.runtime.kakaoRef.current;
    const map = options.runtime.mapRef.current;
    const images = options.runtime.imagesRef.current;
    if (!kakao || !map || !images || options.status !== 'ready') return;

    const previous = previousSelected.current;
    if (previous) {
      const marker = options.runtime.markerByPlaceId.current.get(previous.placeId);
      marker?.setImage(baseImage(previous));
      marker?.setZIndex(0);
    }
    previousSelected.current = options.selectedPlace;

    if (!options.selectedPlace) {
      info.current?.overlay.setMap(null);
      return;
    }

    options.onClearTransient();
    const marker = options.runtime.markerByPlaceId.current.get(options.selectedPlace.placeId);
    marker?.setImage(images.selected.get(colorOf(options.selectedPlace.category)));
    marker?.setZIndex(10);

    const position = new kakao.maps.LatLng(options.selectedPlace.lat, options.selectedPlace.lng);
    centerForPopup(position);
    if (!info.current) {
      // React가 내용을 나중에 그리므로 SDK anchor가 아니라 CSS가 자기 크기로 정렬한다.
      const element = document.createElement('div');
      element.style.position = 'relative';
      info.current = {
        element,
        root: createRoot(element),
        overlay: new kakao.maps.CustomOverlay({ position, content: element, xAnchor: 0, yAnchor: 0, zIndex: 20 }),
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
  }, [options.bottomInset]);

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
