import {Suspense} from 'react';
import SpotsAdmin from '../../../components/admin/spots-admin';

export const metadata = {title: '스팟 관리'};

export default function Page() {
  const kakaoMapKey = process.env.KAKAO_MAP_KEY || '';
  return (
    <Suspense>
      <SpotsAdmin kakaoMapKey={kakaoMapKey} />
    </Suspense>
  );
}
