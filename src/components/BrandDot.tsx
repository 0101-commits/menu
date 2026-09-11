// 네이버·카카오·구글을 나타내는 동그란 표식.
//
// 세 브랜드 색은 토큰화하지 않는다. 맛핀 테마가 바뀌어도 사용자가 알아봐야 하는 색이다.
// 배경을 칠하지 않고 이 점에만 색을 남기는 이유는, 카드마다 초록·노랑·파랑이 반복되면
// 목록 전체가 색 소음이 되어 정작 선택된 항목이 안 보이기 때문이다.

export type Brand = 'naver' | 'kakao' | 'google';

const SPEC: Record<Brand, { label: string; color: string; dark: boolean; name: string }> = {
  naver: { label: 'N', color: 'var(--matpin-brand-naver)', dark: false, name: '네이버' },
  kakao: { label: 'K', color: 'var(--matpin-brand-kakao)', dark: true, name: '카카오' },
  google: { label: 'G', color: 'var(--matpin-brand-google)', dark: false, name: '구글' },
};

export function brandName(brand: Brand) {
  return SPEC[brand].name;
}

export function BrandDot({ brand, size = 18 }: { brand: Brand; size?: number }) {
  const s = SPEC[brand];
  return (
    <span
      aria-hidden="true"
      className="grid place-items-center rounded-full shrink-0 font-bold"
      style={{
        background: s.color,
        color: s.dark ? '#111' : '#fff',
        width: size,
        height: size,
        fontSize: Math.round(size * 0.56),
      }}
    >
      {s.label}
    </span>
  );
}
