import { Place } from '../data/places';

// 네이버·카카오·구글 지도로 보내는 버튼 묶음.
// PlaceList 카드와 지도 오버레이가 같은 것을 쓰고 있었는데 각자 복사본을 들고 있었다.
//
// 세 브랜드 색은 토큰화하지 않는다. 맛핀 테마가 바뀌어도 사용자가 버튼을 알아봐야 한다.
// 다만 예전처럼 색 배경을 칠하지는 않는다. 카드마다 초록·노랑·파랑이 반복되면
// 목록 전체가 색 소음이 되어 정작 선택된 항목이 안 보였다.
// 이제 배경은 중립이고 브랜드 색은 앞의 동그란 표식에만 남긴다.

function kakaoSearchUrl(place: Place) {
  // 예전에는 카카오 REST API 로 place id 를 찾아 딥링크를 만들었다.
  // 그 키는 VITE_ 접두라 번들에 그대로 노출됐다. 키 없이 되는 검색 링크로 바꾼다.
  return `https://map.kakao.com/?q=${encodeURIComponent(`${place.name} ${place.address}`)}`;
}

function googleUrl(place: Place) {
  return `https://www.google.com/maps/search/${encodeURIComponent(place.name)}/@${place.lat},${place.lng},17z`;
}

// 사이드바가 좁을 때(모바일 320px) 세 버튼이 한 줄에 들어가야 한다.
// 여유를 주지 않으면 "네이 / 버" 처럼 글자가 쪼개진다.
const LINK_CLASS =
  'flex items-center justify-center gap-1 flex-1 min-w-0 min-h-11 px-1.5 rounded-lg ' +
  'bg-surface-fill hover:bg-surface-pressed transition-colors ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

function Dot({ color, label, dark }: { color: string; label: string; dark?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center w-[18px] h-[18px] rounded-full shrink-0 text-[10px] font-bold"
      style={{ background: color, color: dark ? '#111' : '#fff' }}
    >
      {label}
    </span>
  );
}

export function PlaceLinks({ place }: { place: Place }) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <div className="flex gap-2">
      <a href={place.naverUrl} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <Dot color="var(--matpin-brand-naver)" label="N" />
        <span className="text-xs font-medium text-fg whitespace-nowrap">네이버</span>
      </a>
      <a href={kakaoSearchUrl(place)} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <Dot color="var(--matpin-brand-kakao)" label="K" dark />
        <span className="text-xs font-medium text-fg whitespace-nowrap">카카오</span>
      </a>
      <a href={googleUrl(place)} target="_blank" rel="noopener noreferrer" onClick={stop} className={LINK_CLASS}>
        <Dot color="var(--matpin-brand-google)" label="G" />
        <span className="text-xs font-medium text-fg whitespace-nowrap">구글</span>
      </a>
    </div>
  );
}
