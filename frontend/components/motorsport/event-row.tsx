import {dateRangeLabel, eventPhase, kstTimeLabel} from '../../lib/motorsport';
import {KIND_LABELS, PHASE_LABELS, type PublicEvent} from '../../lib/motorsport-types';
import {motorsportUrl} from '../../lib/format';
import styles from './motorsport.module.css';

// One schedule row — shared by the list view, the calendar's selected-day
// panel and (compact) the home page preview. Always real event data, never
// placeholder rows.
export default function EventRow({event, today, compact = false}: {event: PublicEvent; today: string; compact?: boolean}) {
  const phase = eventPhase(event, today);
  const flagged = event.status === 'CANCELLED' || event.status === 'CHANGED' || event.status === 'TENTATIVE';
  return (
    <a href={motorsportUrl(event.id)} className={`${styles.row} ${compact ? styles.rowCompact : ''}`}>
      <span className={styles.rowDate}>
        {dateRangeLabel(event.startsOn, event.endsOn)}
        {event.startsAt && <small>{kstTimeLabel(event.startsAt)}</small>}
      </span>
      <span className={styles.rowBody}>
        <span className={styles.rowTitle}>{event.title}</span>
        <span className={styles.rowMeta}>
          <span className={styles.tag}>{KIND_LABELS[event.kind]}</span>
          <span className={`${styles.phaseTag} ${styles[`phase-${phase}`]}`}>{PHASE_LABELS[phase]}</span>
          {flagged && <span className={styles.statusTag}>{event.status === 'CANCELLED' ? '취소' : event.status === 'CHANGED' ? '일정 변경' : '잠정'}</span>}
          {event.series && <span>{event.series.name}</span>}
          <span>
            {event.venue.name}
            {event.venue.region ? ` · ${event.venue.region}` : ''}
          </span>
        </span>
      </span>
    </a>
  );
}
