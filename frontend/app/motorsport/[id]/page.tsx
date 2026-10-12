import {notFound} from 'next/navigation';
import MotorsportPage from '../../../components/motorsport/motorsport-page';
import MotorsportDetail from '../../../components/motorsport/motorsport-detail';

export const metadata = {title: '모터스포츠 일정'};

// /motorsport/{id} — motorsport_events.id is a SERIAL (int4), same bound as
// the community post route.
export default async function Page({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647) notFound();
  return (
    <MotorsportPage>
      <MotorsportDetail key={id} id={Number(id)} />
    </MotorsportPage>
  );
}
