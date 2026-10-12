import {ChevronIcon} from '../common/icons';
import {KIND_LABELS, SCOPE_LABELS, type EventKind, type SeriesScope} from '../../lib/motorsport-types';
import {addMonthsToKey, kstToday, monthKey, monthLabel} from '../../lib/motorsport';
import styles from './motorsport.module.css';

const KINDS: {value: EventKind | ''; label: string}[] = [
  {value: '', label: '전체'},
  ...Object.entries(KIND_LABELS).map(([value, label]) => ({value: value as EventKind, label})),
];
const SCOPES: {value: SeriesScope | ''; label: string}[] = [
  {value: '', label: '전체'},
  ...Object.entries(SCOPE_LABELS).map(([value, label]) => ({value: value as SeriesScope, label})),
];

type Props = {
  view: 'calendar' | 'list';
  onViewChange: (view: 'calendar' | 'list') => void;
  month: string;
  onMonthChange: (month: string) => void;
  kind: EventKind | '';
  onKindChange: (kind: EventKind | '') => void;
  scope: SeriesScope | '';
  onScopeChange: (scope: SeriesScope | '') => void;
};

// Toolbar shared by calendar and list view: 캘린더/리스트 전환, 월 이동, 종목·국내외 필터.
export default function MotorsportFilters({view, onViewChange, month, onMonthChange, kind, onKindChange, scope, onScopeChange}: Props) {
  const isCurrentMonth = month === monthKey(kstToday());
  return (
    <div className={styles.toolbar}>
      <div className={styles.monthNav}>
        <button type="button" aria-label="이전 달" onClick={() => onMonthChange(addMonthsToKey(month, -1))}>
          <ChevronIcon size={18} className={styles.chevronLeft} />
        </button>
        <strong>{monthLabel(month)}</strong>
        <button type="button" aria-label="다음 달" onClick={() => onMonthChange(addMonthsToKey(month, 1))}>
          <ChevronIcon size={18} />
        </button>
        {!isCurrentMonth && (
          <button type="button" className={styles.todayButton} onClick={() => onMonthChange(monthKey(kstToday()))}>
            오늘
          </button>
        )}
      </div>

      <div className={styles.filterGroup}>
        <div className={styles.chips} role="group" aria-label="종목 선택">
          {KINDS.map((k) => (
            <button key={k.value || 'all'} type="button" aria-pressed={kind === k.value} onClick={() => onKindChange(k.value)}>
              {k.label}
            </button>
          ))}
        </div>
        <div className={styles.segment} role="group" aria-label="국내/해외 선택">
          {SCOPES.map((s) => (
            <button key={s.value || 'all'} type="button" aria-pressed={scope === s.value} onClick={() => onScopeChange(s.value)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className={styles.segment} role="group" aria-label="보기 전환">
          <button type="button" aria-pressed={view === 'calendar'} onClick={() => onViewChange('calendar')}>
            캘린더
          </button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => onViewChange('list')}>
            리스트
          </button>
        </div>
      </div>
    </div>
  );
}
