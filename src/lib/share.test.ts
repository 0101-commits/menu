import { describe, expect, it } from 'vitest';
import { matchShared, readShare } from './share';
import { place } from '../test/fixtures';

const kimbap = place({
  placeId: '1865051065', name: '백나예김밥 제생병원직영점', kakaoId: '1418249809',
  sido: '경기도', sigungu: '성남시 분당구', dong: '서현동',
});
const chainA = place({ placeId: '11', id: 11, name: '명당만두', sigungu: '강남구', dong: '역삼동' });
const chainB = place({ placeId: '12', id: 12, name: '명당만두', sigungu: '성남시 분당구', dong: '서현동' });
const otoo = place({ placeId: '13', id: 13, name: '오토김밥', sigungu: '용산구', dong: '이태원동' });
const places = [chainA, kimbap, chainB, otoo];

describe('공유로 받은 글에서 저장한 가게 찾기', () => {
  it('주소의 title·text·url 을 한 덩어리로 읽고, 없으면 null', () => {
    expect(readShare('?title=%EB%A7%9B&text=a&url=https%3A%2F%2Fnaver.me%2Fx')).toBe('맛\na\nhttps://naver.me/x');
    expect(readShare('?place=1')).toBeNull();
  });

  it('긴 링크의 장소 번호로 찾는다(네이버·카카오)', () => {
    expect(matchShared('https://map.naver.com/p/entry/place/1865051065?c=15', places)).toEqual({ kind: 'place', place: kimbap });
    expect(matchShared('https://m.place.naver.com/restaurant/1865051065/home', places)).toEqual({ kind: 'place', place: kimbap });
    expect(matchShared('https://map.naver.com/p?placeId=1865051065', places)).toEqual({ kind: 'place', place: kimbap });
    expect(matchShared('https://place.map.kakao.com/1418249809', places)).toEqual({ kind: 'place', place: kimbap });
  });

  it('짧은 링크면 앱 꼬리표·앱 이름 줄을 뗀 이름 줄로 찾고, 주소의 구·동이 맞아야 연다', () => {
    const naver = '[네이버지도]\n백나예김밥 제생병원직영점\n경기 성남시 분당구 서현동\nhttps://naver.me/abc';
    expect(matchShared(naver, places)).toEqual({ kind: 'place', place: kimbap });
    const kakao = '카카오맵\n[카카오맵] 백나예김밥 제생병원직영점\n경기 성남시 분당구 황새울로 1\nhttps://kko.to/abc';
    expect(matchShared(kakao, places)).toEqual({ kind: 'place', place: kimbap });
  });

  it('같은 이름이 여럿이면 글에 나온 동으로 고른다', () => {
    expect(matchShared('[카카오맵] 명당만두\n경기 성남시 분당구 서현동 1', places)).toEqual({ kind: 'place', place: chainB });
  });

  it('이름이 겹쳐도 다른 동네 가게는 열지 않고 검색으로 넘긴다', () => {
    // 저장 안 한 다른 지점. 예전에는 저장한 「오토김밥」(이태원동)이 열렸다.
    expect(matchShared('[카카오맵] 오토김밥 신사직영점\n서울 강남구 압구정로 1', places))
      .toEqual({ kind: 'search', text: '오토김밥 신사직영점' });
    expect(matchShared('[카카오맵] 명당만두\n부산 중구 광복로 1', places)).toEqual({ kind: 'search', text: '명당만두' });
  });

  it('주소가 없으면 이름이 정확히 같은 가게가 하나일 때만 연다', () => {
    expect(matchShared('오토김밥\nhttps://kko.to/abc', places)).toEqual({ kind: 'place', place: otoo });
    expect(matchShared('명당만두\nhttps://kko.to/abc', places)).toEqual({ kind: 'search', text: '명당만두' });
  });

  it('저장 목록에 없으면 첫 줄로 검색하게 넘기고, 짧은 링크뿐이면 null', () => {
    expect(matchShared('[카카오맵] 처음 보는 집\nhttps://kko.to/abc', places)).toEqual({ kind: 'search', text: '처음 보는 집' });
    expect(matchShared('카카오맵\nhttps://kko.to/abc', places)).toBeNull();
  });
});
