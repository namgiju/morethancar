// morethancar의 주요 서비스 목록. 메인 헤더 메뉴와 첫 화면 아래 바로가기가 같은
// 목록을 쓴다. `href`가 없는 서비스는 아직 페이지가 없어 링크 대신 "오픈 예정"으로
// 표시한다(없는 주소로 보내 404를 띄우지 않기 위해서). 페이지를 만들면 href만 채운다.
//
// 부품장터(/parts)는 잠정 보류라 이 목록에 넣지 않는다. 코드·API·데이터는 그대로
// 있고, 직접 접근은 next.config.ts의 redirects가 커뮤니티 "부품 이야기"로 보낸다.
export type ServiceKey = 'community' | 'garage' | 'motorsport' | 'ev' | 'spots';

export type Service = {
  key: ServiceKey;
  label: string;
  description: string;
  href?: string;
};

export const SERVICES: Service[] = [
  {key: 'community', label: '커뮤니티', description: '오너들의 정비·드라이브·부품 이야기', href: '/community'},
  {key: 'garage', label: '내 차고', description: '내 차를 등록하고 기록을 남겨보세요', href: '/home'},
  {key: 'motorsport', label: '모터스포츠', description: '서킷 주행일과 레이스 일정', href: '/motorsport'},
  {key: 'ev', label: '전기차', description: '보조금·충전·정책 정보', href: '/ev'},
  {key: 'spots', label: '스팟', description: '가까운 와인딩 코스와 심레이싱 시설 찾기', href: '/spots'},
];
