import {Suspense} from 'react';
import MotorsportPage from '../../components/motorsport/motorsport-page';
import MotorsportBrowser from '../../components/motorsport/motorsport-browser';

export const metadata = {title: '모터스포츠 일정'};

export default function Page() {
  return (
    <MotorsportPage>
      <Suspense>
        <MotorsportBrowser />
      </Suspense>
    </MotorsportPage>
  );
}
