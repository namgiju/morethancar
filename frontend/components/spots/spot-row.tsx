import {formatDistanceKm} from '../../lib/geolocation';
import {CATEGORY_LABELS} from '../../lib/spots-types';
import type {SpotWithDistance} from '../../lib/spots-types';
import {spotUrl} from '../../lib/format';
import styles from './spots.module.css';

// 목록 항목: 장소명, 카테고리, 지역, (현재 위치가 있으면) 거리, 대표 이미지, 간단한 설명.
export default function SpotRow({spot, selected, onSelect}: {spot: SpotWithDistance; selected: boolean; onSelect: () => void}) {
  return (
    <li>
      <a
        href={spotUrl(spot.id)}
        className={`${styles.spotRow} ${selected ? styles.spotRowSelected : ''}`}
        onMouseEnter={onSelect}
        onFocus={onSelect}
      >
        {spot.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.spotThumb} src={spot.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className={styles.spotThumbEmpty} aria-hidden="true" />
        )}
        <span className={styles.rowBody}>
          <span className={styles.rowTitle}>{spot.name}</span>
          <span className={styles.rowMeta}>
            <span className={styles.tag}>{CATEGORY_LABELS[spot.category]}</span>
            {spot.region && <span>{spot.region}</span>}
            {spot.distanceFromMeKm != null && <span>직선거리 {formatDistanceKm(spot.distanceFromMeKm)}</span>}
          </span>
          {spot.description && <span className={styles.rowDescription}>{spot.description}</span>}
        </span>
      </a>
    </li>
  );
}
