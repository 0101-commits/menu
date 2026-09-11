// 검색 질의를 다루는 규칙.
//
// 예전에는 이름·주소에 대한 includes 하나였다. 세 가지를 더한다.
//   1) 질의 분해 — "강남역 일식" 에서 카테고리 토큰을 떼어 낸다.
//   2) 세분류·동 이름도 검색 대상에 넣는다. "김밥" "서현동" 이 맞아야 한다.
//   3) 초성 검색 — "ㄱㅂ" 으로 김밥집을 찾는다.
//
// 정렬은 이름 접두 일치 → 이름 포함 → 세분류 → 주소 순. 가장 그럴 법한 것이 위로 온다.

import type { Place } from '../types';
import { CATEGORIES } from './categories.ts';

const CHO = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];

/** 한글 문자열을 초성열로. "김밥" → "ㄱㅂ" */
export function toChoseong(s: string): string {
  let out = '';
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) out += CHO[Math.floor((code - 0xac00) / 588)];
    else out += ch;
  }
  return out;
}

const CHO_ONLY = new RegExp(`^[${CHO.join('')}\\s]+$`);

/** 입력이 초성만으로 되어 있는지. 두 글자 이상일 때만 초성 검색으로 본다. */
export function isChoseongQuery(q: string): boolean {
  const t = q.replace(/\s/g, '');
  return t.length >= 2 && CHO_ONLY.test(q);
}

export interface ParsedQuery {
  /** 대분류로 해석된 토큰 */
  categories: string[];
  /** 나머지 자유 검색어 */
  text: string;
}

// 사람이 쓰는 말 → 대분류. 칩 이름을 그대로 치지 않는 경우를 받아 준다.
const ALIAS: Record<string, string> = {
  고기: '구이', 삼겹살: '구이', 갈비: '구이', 곱창: '구이',
  술: '술집', 이자카야: '술집', 포차: '술집', 와인: '술집',
  커피: '카페', 베이커리: '디저트', 빵: '디저트', 케이크: '디저트',
  파스타: '양식', 피자: '양식', 스테이크: '양식',
  초밥: '일식', 스시: '일식', 라멘: '면', 라면: '면', 국수: '면',
  회: '해산물', 조개: '해산물', 해물: '해산물',
  마라탕: '중식', 짜장면: '중식', 짬뽕: '중식',
  쌀국수: '아시아', 베트남: '아시아', 태국: '아시아',
  떡볶이: '분식', 김밥: '분식',
  국밥: '국물', 찌개: '국물', 탕: '국물',
};

/**
 * 질의에서 카테고리 토큰을 떼어 낸다.
 * 토큰이 전부 카테고리면 text 는 빈 문자열이 된다("일식" 만 입력한 경우).
 */
export function parseQuery(q: string): ParsedQuery {
  const tokens = q.trim().split(/\s+/).filter(Boolean);
  const categories: string[] = [];
  const rest: string[] = [];
  for (const t of tokens) {
    const cat = (CATEGORIES as readonly string[]).includes(t) ? t : ALIAS[t];
    if (cat && !categories.includes(cat)) categories.push(cat);
    else rest.push(t);
  }
  return { categories, text: rest.join(' ') };
}

/** 검색 대상이 되는 문자열들. 초성 인덱스는 이름에만 만든다(주소 초성은 오탐이 많다). */
export interface SearchIndexEntry {
  place: Place;
  name: string;
  nameCho: string;
  haystack: string;
}

export function buildIndex(places: Place[]): SearchIndexEntry[] {
  return places.map((p) => {
    const name = p.name.toLowerCase();
    return {
      place: p,
      name,
      nameCho: toChoseong(p.name),
      haystack: `${name} ${p.mcidName.toLowerCase()} ${p.address.toLowerCase()} ${p.dong}`,
    };
  });
}

/** 0 = 불일치. 클수록 잘 맞는다. */
function scoreOf(e: SearchIndexEntry, q: string, cho: boolean): number {
  if (cho) return e.nameCho.includes(q) ? (e.nameCho.startsWith(q) ? 4 : 3) : 0;
  if (e.name.startsWith(q)) return 4;
  if (e.name.includes(q)) return 3;
  if (e.place.mcidName.toLowerCase().includes(q)) return 2;
  if (e.haystack.includes(q)) return 1;
  return 0;
}

/** 검색어에 맞는 장소를 점수 순으로. 검색어가 비면 입력 순서 그대로 돌려준다. */
export function searchPlaces(index: SearchIndexEntry[], text: string): Place[] {
  const q = text.trim();
  if (!q) return index.map((e) => e.place);
  const cho = isChoseongQuery(q);
  const needle = cho ? q.replace(/\s/g, '') : q.toLowerCase();

  const hits: { place: Place; score: number }[] = [];
  for (const e of index) {
    const score = scoreOf(e, needle, cho);
    if (score > 0) hits.push({ place: e.place, score });
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.map((h) => h.place);
}
