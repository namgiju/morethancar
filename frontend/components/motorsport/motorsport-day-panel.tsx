import {eventsOnDate} from '../../lib/motorsport';
import type {PublicEvent} from '../../lib/motorsport-types';
import EventRow from './event-row';
import styles from './motorsport.module.css';

function dayHeading(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return d.toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short'});
}

// Events for the calendar's selected day (날짜 클릭 시 해당 날짜의 일정 확인).
export default function MotorsportDayPanel({date, events, today}: {date: string; events: PublicEvent[]; today: string}) {
  const dayEvents = eventsOnDate(events, date);
  return (
    <div className={styles.dayPanel}>
      <div className={styles.panelHead}>
        <h2>{dayHeading(date)}</h2>
        <span className={styles.panelCaption}>{dayEvents.length ? `일정 ${dayEvents.length}건` : null}</span>
      </div>
      {dayEvents.length ? (
        <ol className={styles.list}>
          {dayEvents.map((event) => (
            <li key={event.id}>
              <EventRow event={event} today={today} />
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.empty}>이 날짜에는 등록된 일정이 없어요.</p>
      )}
    </div>
  );
}
