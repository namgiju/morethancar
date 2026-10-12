import {Suspense} from 'react';
import SpotsPage from '../../components/spots/spots-page';
import SpotsBrowser from '../../components/spots/spots-browser';

export const metadata = {title: '스팟'};

// KAKAO_MAP_KEY는 런타임에 읽는다(빌드 시 inline하지 않음 — frontend/lib/kakao-maps.ts 주석 참고).
// app/layout.tsx가 모든 페이지를 동적 렌더링으로 강제하므로 매 요청마다 현재 값을 읽는다.
export default function Page() {
  const kakaoMapKey = process.env.KAKAO_MAP_KEY || '';
  return (
    <SpotsPage>
      <Suspense>
        <SpotsBrowser kakaoMapKey={kakaoMapKey} />
      </Suspense>
    </SpotsPage>
  );
}
