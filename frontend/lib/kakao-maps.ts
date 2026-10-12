// 카카오맵 JS SDK 로더(docs/plans/MOTORSPORT-AND-SPOTS-PLAN.md §4 결정 6). 클라이언트 컴포넌트에서만
// 부르고(autoload=false), 지도가 쓰이는 곳들(components/spots/spots-map.tsx,
// components/spots/spot-route-map.tsx, components/admin/spot-dialog.tsx)이 이 로더 하나를 같이 쓴다.
// 키가 없으면 즉시 실패해 호출한 쪽이 "지도 준비 중" 등 대체 화면을 보여줄 수 있게 한다(지도 없이도
// 목록은 항상 동작해야 한다).
//
// 키는 KAKAO_MAP_KEY(NEXT_PUBLIC_ 접두사 없음 — REVCC_API_ORIGIN과 같은 이유: 이미지를 한 번
// 빌드해 여러 환경에서 실행하므로 빌드 시점에 inline하지 않는다)로 서버에서 런타임에 읽어,
// 각 서버 컴포넌트 페이지(app/spots/page.tsx 등)가 클라이언트 컴포넌트까지 prop으로 내려준다.
// 이 파일의 함수는 모두 키를 인자로 받는다 — .env의 값을 직접 읽지 않는다.
//
// CSP(frontend/proxy.ts): 이 코드로 만드는 <script> 태그는 strict-dynamic 아래에서 신뢰된
// 스크립트(Next가 nonce를 붙여 불러온 번들)가 동적으로 추가하는 것이라 호스트를 script-src에
// 따로 더하지 않아도 된다. 다만 SDK가 불러오는 지도 타일·XHR은 img-src/connect-src에 카카오
// 도메인을 추가해야 한다 — 실제 네트워크 요청으로 정확한 도메인을 다시 확인해야 한다(§4 메모).

declare global {
  interface Window {
    kakao?: {
      maps: {
        load: (callback: () => void) => void;
        LatLng: new (lat: number, lng: number) => unknown;
        LatLngBounds: new () => {extend: (point: unknown) => void};
        Map: new (container: HTMLElement, options: {center: unknown; level: number}) => KakaoMap;
        Marker: new (options: {position: unknown; map?: KakaoMap; image?: unknown; zIndex?: number}) => KakaoMarker;
        MarkerImage: new (src: string, size: unknown, options?: unknown) => unknown;
        Size: new (width: number, height: number) => unknown;
        Point: new (x: number, y: number) => unknown;
        Polyline: new (options: {path: unknown[]; strokeWeight: number; strokeColor: string; strokeOpacity: number}) => {setMap: (map: KakaoMap | null) => void};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 이벤트 핸들러 payload는 이벤트 종류마다 다르다(click: {latLng}, idle: 없음 등).
        event: {addListener: (target: unknown, type: string, handler: (...args: any[]) => void) => void};
      };
    };
  }
}
export type KakaoMap = {
  setCenter: (point: unknown) => void;
  panTo: (point: unknown) => void;
  setBounds: (bounds: unknown) => void;
  getBounds: () => {getSouthWest: () => {getLat: () => number; getLng: () => number}; getNorthEast: () => {getLat: () => number; getLng: () => number}};
  setLevel: (level: number) => void;
};
export type KakaoMarker = {setMap: (map: KakaoMap | null) => void; setPosition: (point: unknown) => void};

let loadPromise: Promise<void> | null = null;

export function loadKakaoMaps(key: string): Promise<void> {
  if (!key) return Promise.reject(new Error('카카오맵 API 키가 설정되지 않았어요.'));
  if (typeof window === 'undefined') return Promise.reject(new Error('브라우저에서만 지도를 불러올 수 있어요.'));
  if (window.kakao?.maps) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(key)}&autoload=false`;
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('카카오맵을 불러오지 못했어요.'));
    };
    script.onload = () => window.kakao!.maps.load(() => resolve());
    document.head.appendChild(script);
  });
  return loadPromise;
}

// 카테고리별 마커 색(원 모양 SVG를 data URI로 — 별도 이미지 호스팅이 필요 없고 img-src 'self' blob: data:에
// 이미 포함돼 있어 CSP 추가 없이 쓸 수 있다).
const MARKER_SVG = (color: string, selected: boolean) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${selected ? 30 : 22}" height="${selected ? 30 : 22}" viewBox="0 0 24 24">` +
      `<circle cx="12" cy="12" r="9" fill="${color}" stroke="#fff" stroke-width="${selected ? 3 : 2}"/>` +
      `</svg>`,
  )}`;
export const markerImageSrc = (category: 'WINDING' | 'SIM_RACING', selected: boolean) =>
  MARKER_SVG(category === 'WINDING' ? '#4a7300' : '#2b4a9e', selected);
export const CURRENT_LOCATION_MARKER_SVG = MARKER_SVG('#c8f53a', false);
