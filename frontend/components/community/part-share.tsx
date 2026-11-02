'use client';

import type {PublicVehicle, VehiclePart} from '../../lib/community-types';
import {carUrl, imageUrl, postUrl} from '../../lib/format';
import {kstToday} from '../../lib/motorsport';
import {partDistance, partEvidenceLabel, partShareText, partSpan, vehicleStatusLabel} from '../../lib/part-share';
import CommunityPage, {useNotice} from './community-page';
import CopyTextButton from './copy-text-button';
import MemberLink from './member-link';
import {useCommunitySession} from './use-community-session';
import styles from './post-detail.module.css';

// Body of the fixed part share page (/community/cars/:id/parts/:partId). The
// vehicle's ownership status and the part's evidence label are separate lines.
export default function PartShare({vehicle, part}: {vehicle: PublicVehicle; part: VehiclePart}) {
  const auth = useCommunitySession();
  const {notice} = useNotice();
  const today = kstToday();
  const distance = partDistance(part);
  const reviews = (vehicle.posts ?? []).filter((p) => p.partId === part.id);
  return (
    <CommunityPage auth={auth} notice={notice}>
      <span className={styles.category}>PART HISTORY</span>
      <h1 className={styles.title}>
        {part.brand} {part.name}
      </h1>
      {part.spec && <p className={styles.muted}>{part.spec}</p>}
      <ul className={styles.shareFacts}>
        <li>
          장착 {part.installedOn} ~ {part.removedOn ?? '현재'} ({partSpan(part, today)}
          {distance ? `, ${distance} 사용` : ''})
        </li>
        {part.installMileage !== null && <li>장착 시 주행거리 {part.installMileage.toLocaleString()}km</li>}
        <li>부품 기록: {partEvidenceLabel(part)}</li>
        <li>
          차량: <a href={carUrl(vehicle.id)}>{`${vehicle.year} ${vehicle.model}`}</a> · {vehicleStatusLabel(vehicle)} ·{' '}
          <MemberLink id={vehicle.ownerId} name={vehicle.username} />
        </li>
      </ul>
      {part.imageIds.length > 0 && (
        <div className={styles.sharePhotos}>
          {part.imageIds.map((id) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={id} src={imageUrl(id)} alt={`${part.brand} ${part.name} 사진`} />
          ))}
        </div>
      )}
      {reviews.length > 0 && (
        <section className={styles.comments} aria-labelledby="part-reviews-title">
          <h3 id="part-reviews-title">연결된 후기 {reviews.length}</h3>
          {reviews.map((p) => (
            <a key={p.id} className={styles.boardLink} href={postUrl(p)}>
              {p.title} →
            </a>
          ))}
        </section>
      )}
      <CopyTextButton text={partShareText(part, vehicle, today)} />
      <p className={styles.disclaimer}>소유자가 입력한 기록이며 morethancar가 보증하지 않습니다.</p>
    </CommunityPage>
  );
}
