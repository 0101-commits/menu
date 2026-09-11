import type { Place } from '../types';
import { BrandDot } from './BrandDot';

// 네이버·카카오·구글 지도로 보내는 버튼 묶음.
//
// 카카오는 place ID 를 알면 상세 페이지로 바로 보낸다. 매칭이 안 된 곳만 검색 URL 로 떨어진다.
// (예전에는 항상 검색 URL 이었다. REST 키를 번들에 넣지 않으려는 이유였는데,
//  이제 ID 를 빌드 타임에 붙이므로 키 없이도 딥링크가 된다.)

function kakaoUrl(place: Place) {
  return place.kakaoId
    ? `https://place.map.kakao.com/${place.kakaoId}`
    : `https://map.kakao.com/?q=${encodeURIComponent(`${place.name} ${place.address}`)}`;
}

function googleUrl(place: Place) {
  return place.googlePlaceId
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&query_place_id=${place.googlePlaceId}`
    : `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/@${place.lat},${place.lng},17z`;
}

// 사이드바가 좁을 때(모바일 320px) 세 버튼이 한 줄에 들어가야 한다.
// 여유를 주지 않으면 "네이 / 버" 처럼 글자가 쪼개진다.
const LINK_CLASS =
  'flex items-center justify-center gap-1 flex-1 min-w-0 min-h-11 px-1.5 rounded-lg ' +
  'bg-surface-fill hover:bg-surface-pressed transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

export function PlaceLinks({ place }: { place: Place }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex gap-2">
      <a href={place.naverUrl} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <BrandDot brand="naver" />
        <span className="text-xs font-medium text-fg whitespace-nowrap">네이버</span>
      </a>
      <a href={kakaoUrl(place)} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <BrandDot brand="kakao" />
        <span className="text-xs font-medium text-fg whitespace-nowrap">카카오</span>
      </a>
      <a href={googleUrl(place)} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <BrandDot brand="google" />
        <span className="text-xs font-medium text-fg whitespace-nowrap">구글</span>
      </a>
    </div>
  );
}
