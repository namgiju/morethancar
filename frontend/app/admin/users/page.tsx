import {Suspense} from 'react';
import OperatorsAdmin from '../../../components/admin/operators-admin';

export const metadata = {title: '운영자 권한 관리'};

export default function Page() {
  return (
    <Suspense>
      <OperatorsAdmin />
    </Suspense>
  );
}
