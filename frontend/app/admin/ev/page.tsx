import {Suspense} from 'react';
import EvAdmin from '../../../components/admin/ev-admin';

// 관리자 화면은 색인하지 않는다(STEP 7 지시 — 공개 /ev 메뉴의 SOON 해제와는 무관).
export const metadata = {title: '전기차 정책 관리', robots: {index: false, follow: false}};

export default function Page() {
  return (
    <Suspense>
      <EvAdmin />
    </Suspense>
  );
}
