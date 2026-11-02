import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {cache} from 'react';
import PartShare, {PartShareUnavailable} from '../../../../../../components/community/part-share';
import {kstToday} from '../../../../../../lib/motorsport';
import {partDistance, partEvidenceLabel, partShareUrl, partSpan, SITE_URL, vehicleStatusLabel} from '../../../../../../lib/part-share';
import {fetchPublicVehicleServer} from '../../../../../../lib/server-api';

type Params = Promise<{id: string; partId: string}>;

const validId = (value: string) => /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 2147483647;

// Fixed share URL for one part's history (MVP stage 5). No token: sharing is
// controlled by the part's is_public alone. The data is the anonymous public
// vehicle detail, so a private, deleted or withdrawn-owner part is a 404 for
// everyone (the owner included) right after the change. A backend failure
// (e.g. a slow Neon wake-up) renders a "try again" page instead of a 500 so
// link previews don't cache an error, and is never mistaken for a 404.
const loadShare = cache(async (id: string, partId: string) => {
  if (!validId(id) || !validId(partId)) return {status: 'missing' as const};
  let vehicle;
  try {
    vehicle = await fetchPublicVehicleServer(Number(id));
  } catch {
    return {status: 'unavailable' as const};
  }
  const part = vehicle?.parts?.find((p) => p.id === Number(partId));
  if (!vehicle || !part) return {status: 'missing' as const};
  // Only what the page shows goes to the client component (not every record/part).
  return {
    status: 'ok' as const,
    today: kstToday(),
    part,
    vehicle: {
      id: vehicle.id,
      model: vehicle.model,
      year: vehicle.year,
      verified: vehicle.verified,
      archivedAt: vehicle.archivedAt,
      ownerId: vehicle.ownerId,
      username: vehicle.username,
    },
    reviews: (vehicle.posts ?? []).filter((p) => p.partId === part.id),
  };
});

export async function generateMetadata({params}: {params: Params}): Promise<Metadata> {
  const {id, partId} = await params;
  const share = await loadShare(id, partId);
  if (share.status !== 'ok') return {title: '부품 이력', robots: {index: false}};
  const {vehicle, part, today} = share;
  const title = `${part.brand} ${part.name} 장착 이력`;
  const distance = partDistance(part);
  const description = [
    `${part.installedOn} ~ ${part.removedOn ?? '현재'} (${partSpan(part, today)}${distance ? `, ${distance}` : ''})`,
    `${vehicle.year} ${vehicle.model} · ${vehicleStatusLabel(vehicle)}`,
    `부품 기록: ${partEvidenceLabel(part)}`,
  ].join(' · ');
  const url = partShareUrl(vehicle.id, part.id);
  return {
    title,
    description,
    alternates: {canonical: url},
    openGraph: {
      type: 'article',
      title,
      description,
      url,
      siteName: 'morethancar',
      ...(part.imageIds.length ? {images: [`${SITE_URL}/api/board/images/${part.imageIds[0]}`]} : {}),
    },
  };
}

export default async function Page({params}: {params: Params}) {
  const {id, partId} = await params;
  const share = await loadShare(id, partId);
  if (share.status === 'missing') notFound();
  if (share.status === 'unavailable') return <PartShareUnavailable />;
  return <PartShare vehicle={share.vehicle} part={share.part} reviews={share.reviews} today={share.today} />;
}
