import {eventsOnDate, monthGrid} from '../../lib/motorsport';
import type {PublicEvent} from '../../lib/motorsport-types';
import styles from './motorsport.module.css';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type Props = {
  month: string;
  events: PublicEvent[];
  today: string;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
};

// Month grid: today highlighted, days with a published event dotted, click
// selects the day (the panel below shows that day's events).
export default function MotorsportCalendar({month, events, today, selectedDate, onSelectDate}: Props) {
  const weeks = monthGrid(month);
  return (
    <div className={styles.calendar}>
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className={styles.grid} role="grid">
        {weeks.flatMap((week) =>
          week.map((cell) => {
            const dayEvents = eventsOnDate(events, cell.date);
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                className={styles.cell}
                data-in-month={cell.inMonth || undefined}
                data-today={isToday || undefined}
                data-selected={isSelected || undefined}
                aria-current={isToday ? 'date' : undefined}
                aria-pressed={isSelected}
                onClick={() => onSelectDate(cell.date)}
              >
                <span className={styles.cellDate}>{Number(cell.date.slice(8, 10))}</span>
                {dayEvents.length > 0 && (
                  <span className={styles.cellDots} aria-label={`일정 ${dayEvents.length}건`}>
                    {dayEvents.slice(0, 3).map((e) => (
                      <span key={e.id} className={styles.cellDot} />
                    ))}
                    {dayEvents.length > 3 && <span className={styles.cellMore}>+{dayEvents.length - 3}</span>}
                  </span>
                )}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}
