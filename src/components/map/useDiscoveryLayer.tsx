import { useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Discovered, RatingsMap } from '../../types';
import { DiscoveredWindow } from '../DiscoveredWindow';
import type { KakaoObject, MapRuntime } from './types';

interface Options {
  runtime: MapRuntime;
  discovered: Discovered[];
  openDiscovered: Discovered | null;
  setOpenDiscovered: React.Dispatch<React.SetStateAction<Discovered | null>>;
  ratings: RatingsMap;
  failed: Set<string>;
  unavailable: boolean;
  onOpen: (item: Discovered) => void;
  onClearNearby: () => void;
}

export function useDiscoveryLayer({
  runtime, discovered, openDiscovered, setOpenDiscovered,
  ratings, failed, unavailable, onOpen, onClearNearby,
}: Options) {
  const markers = useRef<KakaoObject[]>([]);
  const overlay = useRef<{ overlay: KakaoObject; root: Root; element: HTMLDivElement } | null>(null);
  const callbacks = useRef({ onOpen });
  callbacks.current = { onOpen };

  useEffect(() => {
    const kakao = runtime.kakaoRef.current;
    const map = runtime.mapRef.current;
    const images = runtime.imagesRef.current;
    if (!kakao || !map || !images) return;

    for (const marker of markers.current) marker.setMap(null);
    markers.current = [];
    for (const item of discovered) {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(item.lat, item.lng),
        image: images.discovered,
        title: item.name,
        zIndex: 1,
      });
      kakao.maps.event.addListener(marker, 'click', () => {
        runtime.suppressClick.current = true;
        onClearNearby();
        setOpenDiscovered(item);
        callbacks.current.onOpen(item);
      });
      marker.setMap(map);
      markers.current.push(marker);
    }
    return () => {
      for (const marker of markers.current) marker.setMap(null);
      markers.current = [];
    };
  }, [discovered, runtime, onClearNearby, setOpenDiscovered]);

  useEffect(() => {
    const kakao = runtime.kakaoRef.current;
    const map = runtime.mapRef.current;
    if (!kakao || !map) return;
    if (!openDiscovered) {
      overlay.current?.overlay.setMap(null);
      return;
    }

    const position = new kakao.maps.LatLng(openDiscovered.lat, openDiscovered.lng);
    if (!overlay.current) {
      const element = document.createElement('div');
      element.style.position = 'relative';
      element.style.transform = 'translate(-50%, calc(-100% - 26px))';
      overlay.current = {
        element,
        root: createRoot(element),
        overlay: new kakao.maps.CustomOverlay({ position, content: element, xAnchor: 0, yAnchor: 0, zIndex: 20 }),
      };
    }
    const current = overlay.current;
    const key = `k:${openDiscovered.kakaoId}`;
    current.root.render(
      <DiscoveredWindow
        item={openDiscovered}
        ratings={ratings[key]}
        loading={!unavailable && !failed.has(key) && !ratings[key]}
        unavailable={unavailable}
        failed={failed.has(key)}
        onRetry={() => callbacks.current.onOpen(openDiscovered)}
        onClose={() => setOpenDiscovered(null)}
      />,
    );
    current.overlay.setPosition(position);
    current.overlay.setMap(map);
  }, [openDiscovered, ratings, unavailable, failed, runtime, setOpenDiscovered]);

  useEffect(() => () => {
    const current = overlay.current;
    setTimeout(() => current?.root.unmount(), 0);
  }, []);
}
