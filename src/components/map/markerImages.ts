import type { KakaoNS } from '../../lib/kakao';
import { CATEGORY_GROUPS, OTHER_GROUP } from '../../lib/categories';
import type { KakaoObject } from './types';

// 보통 핀·점은 dotLayer 캔버스가 그린다. 여기 이미지는 카카오 마커로 따로 띄우는 것(선택·번호·발견)만.
function pinSvg(color: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="44" viewBox="0 0 24 34">` +
    `<path d="M12 1C6.2 1 1.5 5.7 1.5 11.5c0 7.9 9.2 19.6 10.1 20.8.2.3.6.3.8 0C13.3 31.1 22.5 19.4 22.5 11.5 22.5 5.7 17.8 1 12 1z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<circle cx="12" cy="11.5" r="4" fill="#fff"/></svg>`,
  )}`;
}

export function numberPinSvg(color: string, number: number) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="36" viewBox="0 0 24 34">` +
    `<path d="M12 1C6.2 1 1.5 5.7 1.5 11.5c0 7.9 9.2 19.6 10.1 20.8.2.3.6.3.8 0C13.3 31.1 22.5 19.4 22.5 11.5 22.5 5.7 17.8 1 12 1z" fill="${color}" stroke="#fff" stroke-width="2"/>` +
    `<text x="12" y="15.5" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="700" fill="#fff">${number}</text></svg>`,
  )}`;
}

function discoveredSvg() {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">' +
    '<circle cx="8" cy="8" r="6" fill="#fff" stroke="#6b7280" stroke-width="2" stroke-dasharray="2.6 2"/></svg>',
  )}`;
}

export interface MarkerImages {
  selected: Map<string, KakaoObject>;
  discovered: KakaoObject;
}

export function buildMarkerImages(kakao: KakaoNS): MarkerImages {
  const selected = new Map<string, KakaoObject>();
  for (const group of [...CATEGORY_GROUPS, OTHER_GROUP]) {
    selected.set(group.color, new kakao.maps.MarkerImage(pinSvg('#c8362a'), new kakao.maps.Size(32, 44), {
      offset: new kakao.maps.Point(16, 44),
    }));
  }
  return {
    selected,
    discovered: new kakao.maps.MarkerImage(discoveredSvg(), new kakao.maps.Size(16, 16), {
      offset: new kakao.maps.Point(8, 8),
    }),
  };
}
