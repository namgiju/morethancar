import {Suspense} from 'react';
import MotorsportAdmin from '../../../components/admin/motorsport-admin';

export const metadata = {title: '모터스포츠 일정 관리'};

export default function Page() {
  return (
    <Suspense>
      <MotorsportAdmin />
    </Suspense>
  );
}
