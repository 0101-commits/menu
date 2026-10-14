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
  /**
   * 네이버가 이 가게의 점수를 자기 화면에 표시하지 않는 상태(showVisitorReviewScore=false).
   * 값 자체는 현재값이고 계속 갱신되지만, 플랫폼이 공개하지 않기로 한 것이다.
   */
  scoreHidden?: boolean;
  booking?: string;
}

export interface KakaoRating {
  score: number | null;
  count: number;
  blogs: number;
  /** ₩ 개수. 1~4 */
  price?: number;
  rank?: { text: string; n?: number };
  closed?: boolean;
  photos?: number;
}

export interface GoogleRating {
  score: number | null;
  count: number;
  price?: number;
  open?: boolean;
  /**
   * 수집 시각(ISO). 구글 값만 이걸 갖는다 — 무기한 보관하고 오래된 것부터 갱신하는 구조라,
   * 화면이 "언제 받은 값인지" 를 말할 수 있어야 한다. 없으면 갱신 전의 옛 값이다.
   */
  at?: string;
}

export interface Ratings {
  naver?: NaverRating;
  kakao?: KakaoRating;
  google?: GoogleRating;

  // 아래 셋은 소스를 가리지 않는다. 카카오가 있으면 카카오 값을, 없으면 네이버 값을 쓴다.
  // 카카오에 안 붙은 가게가 203곳, 붙었는데 영업시간이 비는 곳이 648곳이라
  // "카카오의 영업시간" 으로 두면 다섯 곳 중 한 곳은 영원히 빈칸이었다.

  /** 오늘부터 7일. "11:30~23:00" 형태, 휴무는 빈 문자열 */
  hours?: string[];
  /**
   * hours[0] 이 무슨 요일인지(0=일). 두 소스 모두 "오늘부터 7일" 을 주는데 그 "오늘" 은
   * 수집한 날이다. 보는 날과 며칠 어긋났는지 알아야 요일을 맞게 읽는다.
   */
  hoursDay?: number;
  /** 대표 메뉴 3개까지. 네이버 쪽은 가격이 없는 메뉴가 있다. */
  menus?: { name: string; price?: number }[];

  /** 네이버 페이지가 사라졌거나 카카오 영업상태가 Y 가 아니다. 폐업 의심. */
  closed?: boolean;
}

/** 키는 Place.placeId (네이버 sid) */
export type RatingsMap = Record<string, Ratings>;

/**
 * 상세를 열 때만 받는 것(public/data/details.json). 카카오 장소 응답에서 온다.
 * 목록·지도에는 안 쓰므로 첫 화면이 받는 ratings.json 에서 떼어 냈다.
 */
export interface PlaceDetails {
  /** 카카오 AI 장소 요약(kanana). 제목 한 줄 + 짧은 근거 최대 3개. */
  ai?: { title: string; points: string[] };
  /** 시간대별 방문, 일주일 평균. from = 첫 시각(0~23), v = 가장 붐비는 때 대비 0~100. */
  busy?: { from: number; v: number[] };
}

export type DetailsMap = Record<string, PlaceDetails>;

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
