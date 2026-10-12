import type {SpotWithDistance} from '../../lib/spots-types';
import SpotRow from './spot-row';
import styles from './spots.module.css';

export default function SpotsList({
  spots,
  selectedId,
  onSelect,
}: {
  spots: SpotWithDistance[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  if (!spots.length) return <p className={styles.empty}>이 조건에 맞는 스팟이 없어요.</p>;
  return (
    <ol className={styles.list}>
      {spots.map((spot) => (
        <SpotRow key={spot.id} spot={spot} selected={spot.id === selectedId} onSelect={() => onSelect(spot.id)} />
      ))}
    </ol>
  );
}
