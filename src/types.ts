// 앱 전체가 쓰는 데이터 모양. 데이터 자체는 public/data/*.json 에 있고
// 빌드 타임에 scripts/ 가 만든다. 여기엔 타입만 둔다.

export interface Place {
  id: number;
  name: string;
  /** 대분류 14종. 즐겨찾기 폴더명에서 온다. */
  category: string;
  folder: string;
  /** 세분류. "카페,디저트" "김밥" 같은 네이버 업종. */
  mcidName: string;
  /** 네이버 place ID. 평점·링크의 기준 키다. */
  placeId: string;
  lat: number;
  lng: number;
  /** 지번 주소 전체 */
  address: string;
  naverUrl: string;
  /** 주소에서 뽑은 행정구역. 목록의 지역 필터가 문자열을 다시 쪼개지 않게 미리 나눠 둔다. */
  sido: string;
  sigungu: string;
  dong: string;
  kakaoId?: string;
  googlePlaceId?: string;
  matchConfidence?: 'high' | 'medium';
}

export interface NaverRating {
  /** 네이버는 2021 년에 별점 UI 를 없앴다. 값이 안 내려오는 업체가 있어 null 을 허용한다. */
  score: number | null;
  visitors: number;
  blogs: number;
  /** 키워드 리뷰. t = 문항("음식이 맛있어요"), n = 고른 사람 수. 많은 순. */
  keywords?: { t: string; n: number }[];
  booking?: string;
}

export interface KakaoRating {
  score: number | null;
  count: number;
  blogs: number;
  /** ₩ 개수. 1~4 */
  price?: number;
  /** 오늘부터 7일. "14:00 ~ 24:00" 형태, 휴무는 빈 문자열 */
  hours?: string[];
  menus?: { name: string; price: number }[];
  rank?: { text: string; n?: number };
  closed?: boolean;
  photos?: number;
}

export interface GoogleRating {
  score: number | null;
  count: number;
  price?: number;
  open?: boolean;
}

export interface Ratings {
  naver?: NaverRating;
  kakao?: KakaoRating;
  google?: GoogleRating;
  /** 네이버 페이지가 사라졌거나 카카오 영업상태가 Y 가 아니다. 폐업 의심. */
  closed?: boolean;
}

/** 키는 Place.placeId (네이버 sid) */
export type RatingsMap = Record<string, Ratings>;

/** 지도에 얹는 미저장 가게. 발견 모드에서 카카오 SDK 가 준다. */
export interface Discovered {
  kakaoId: string;
  name: string;
  address: string;
  category: string;
  lat: number;
  lng: number;
  url: string;
}
