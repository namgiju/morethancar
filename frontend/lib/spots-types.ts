// 공개 /spots 페이지 — board-service의 공개 /api/board/spots/*(spots.js) 응답 형태.
// admin-spots.ts의 관리자 전용 형태(publication·감사 컬럼 포함)와 짝을 이룬다
// (lib/motorsport-types.ts ↔ lib/admin-motorsport.ts와 같은 분리).
export type SpotCategory = 'WINDING' | 'SIM_RACING';

export const CATEGORY_LABELS: Record<SpotCategory, string> = {WINDING: '와인딩', SIM_RACING: '심레이싱'};

// 시·도 단위 지역 필터. 관리자 등록 폼과 같은 목록을 써야 필터가 실제로 걸러진다(자유 입력이 아님).
export const REGIONS = [
  '서울', '경기', '인천', '강원', '충북', '충남', '대전', '세종',
  '전북', '전남', '광주', '경북', '경남', '대구', '부산', '울산', '제주',
] as const;
export type Region = (typeof REGIONS)[number];

export type RoutePoint = {lat: number; lng: number};

// category에 따라 와인딩·심레이싱 전용 필드만 값이 채워진다(둘 다 optional로 두고 화면에서
// category로 분기). 없는 정보는 null — 임의로 채우지 않는다.
export type PublicSpot = {
  id: number;
  category: SpotCategory;
  name: string;
  region: string | null;
  address: string;
  latitude: number;
  longitude: number;
  description: string | null;
  imageUrl: string | null;
  linkedPostCount: number;

  // WINDING
  routeStart: string | null;
  routeEnd: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  route: RoutePoint[] | null;
  recommendedTime: string | null;
  caution: string | null;

  // SIM_RACING
  businessHours: string | null;
  officialUrl: string | null;
  reservationUrl: string | null;
  facilityInfo: string | null;
  priceInfo: string | null;
};

// "내 주변 찾기"·지도 목록에서 쓰는, 현재 위치부터의 직선거리를 더한 형태.
// distanceKm(와인딩 코스 길이)와 구분해 distanceFromMeKm으로 둔다.
export type SpotWithDistance = PublicSpot & {distanceFromMeKm: number | null};
