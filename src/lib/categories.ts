// 대분류 14종과 그 위의 6개 색군.
//
// 색군이 따로 있는 이유는 마커다. 14색은 지도 위에서 서로 구분되지 않고,
// 핀 레드는 "선택됨" 전용으로 남겨야 한다. 그래서 마커 색은 6군으로 접고
// 칩·필터는 14종을 그대로 쓴다. 칩이 좁을 때만 6군으로 접어 보여준다.
//
// 색은 카카오 지도 타일(항상 밝음) 위에서 서로 구분되고 핀 레드(#c8362a)와
// 헷갈리지 않는 것으로 골랐다. 브랜드 토큰이 아니라 데이터 인코딩이므로
// 라이트·다크에서 같은 값을 쓴다.

export const CATEGORIES = [
  '한식', '분식', '국물', '면', '중식', '아시아',
  '구이', '술집', '해산물', '일식', '양식', '카페', '디저트', '기타',
] as const;

export interface CategoryGroup {
  key: string;
  label: string;
  color: string;
  members: string[];
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  { key: 'rice',    label: '밥',         color: '#E07B39', members: ['한식', '분식', '국물'] },
  { key: 'noodle',  label: '면',         color: '#C9A227', members: ['면', '중식', '아시아'] },
  { key: 'meat',    label: '고기·술',    color: '#7A4E8C', members: ['구이', '술집'] },
  { key: 'sea',     label: '바다',       color: '#2E7DB8', members: ['해산물', '일식'] },
  { key: 'western', label: '양식',       color: '#3E8E6E', members: ['양식'] },
  { key: 'sweet',   label: '카페·디저트', color: '#C2559B', members: ['카페', '디저트'] },
];

/** 어느 군에도 없는 대분류("기타")는 중립색으로 둔다. */
export const OTHER_GROUP: CategoryGroup = {
  key: 'other', label: '기타', color: '#8A8F97', members: ['기타'],
};

const BY_CATEGORY = new Map<string, CategoryGroup>();
for (const g of CATEGORY_GROUPS) for (const m of g.members) BY_CATEGORY.set(m, g);
for (const m of OTHER_GROUP.members) BY_CATEGORY.set(m, OTHER_GROUP);

export function groupOf(category: string): CategoryGroup {
  return BY_CATEGORY.get(category) ?? OTHER_GROUP;
}

export function colorOf(category: string): string {
  return groupOf(category).color;
}

/** 색군 순서대로 정렬된 대분류 목록. 칩 바에서 비슷한 것끼리 붙어 보이게 한다. */
export function categoriesInGroupOrder(present: Iterable<string>): string[] {
  const set = new Set(present);
  const out: string[] = [];
  for (const g of [...CATEGORY_GROUPS, OTHER_GROUP]) {
    for (const m of g.members) if (set.has(m)) out.push(m);
  }
  // 위 표에 없는 새 분류가 생겨도 잃지 않는다.
  for (const c of set) if (!out.includes(c)) out.push(c);
  return out;
}
