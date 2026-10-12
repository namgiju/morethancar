import {notFound} from 'next/navigation';
import SpotsPage from '../../../components/spots/spots-page';
import SpotDetail from '../../../components/spots/spot-detail';

export const metadata = {title: '스팟'};

// /spots/{id} — drive_spots.id is a SERIAL (int4), same bound as motorsport_events.id.
export default async function Page({params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  if (!/^\d+$/.test(id) || Number(id) < 1 || Number(id) > 2147483647) notFound();
  const kakaoMapKey = process.env.KAKAO_MAP_KEY || '';
  return (
    <SpotsPage>
      <SpotDetail key={id} id={Number(id)} kakaoMapKey={kakaoMapKey} />
    </SpotsPage>
  );
}
