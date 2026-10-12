// "내 주변 찾기" — 브라우저 Geolocation API만 쓴다(서버에 좌표를 저장하지 않는다,
// 백그라운드 추적 없음, 버튼을 눌렀을 때만 권한을 요청한다). STEP 3 요구사항:
// 권한 거부·오류·타임아웃을 모두 구분해서 보여주고, 어떤 경우에도 지역 선택으로 계속 쓸 수 있어야 한다.
export type Coordinates = {latitude: number; longitude: number};

export type LocationError =
  | {kind: 'unsupported'}
  | {kind: 'denied'}
  | {kind: 'unavailable'}
  | {kind: 'timeout'};

export function requestLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject({kind: 'unsupported'} satisfies LocationError);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({latitude: position.coords.latitude, longitude: position.coords.longitude}),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) reject({kind: 'denied'} satisfies LocationError);
        else if (error.code === error.TIMEOUT) reject({kind: 'timeout'} satisfies LocationError);
        else reject({kind: 'unavailable'} satisfies LocationError);
      },
      {enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000},
    );
  });
}

export const LOCATION_ERROR_MESSAGE: Record<LocationError['kind'], string> = {
  unsupported: '이 브라우저는 위치 정보를 지원하지 않아요. 지역 선택으로 찾아보세요.',
  denied: '위치 권한이 거부됐어요. 지역 선택으로 찾아보거나, 브라우저 설정에서 위치 권한을 허용해주세요.',
  unavailable: '현재 위치를 확인할 수 없어요. 지역 선택으로 찾아보세요.',
  timeout: '위치를 확인하는 데 시간이 너무 오래 걸렸어요. 다시 시도하거나 지역 선택으로 찾아보세요.',
};

const EARTH_RADIUS_KM = 6371;

// 두 좌표 사이의 직선거리(Haversine). 실제 도로 주행거리가 아니므로 화면에 "직선거리"로 표시한다.
export function haversineKm(a: Coordinates, b: {latitude: number; longitude: number}): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}
