import type {PublicEvent} from '../../lib/motorsport-types';
import EventRow from './event-row';
import styles from './motorsport.module.css';

function dateHeading(date: string): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  return d.toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short'});
}

// 날짜순 리스트: 시작일이 같은 일정끼리 날짜 제목 아래로 묶는다(선택된 달 안에서).
export default function MotorsportList({events, today}: {events: PublicEvent[]; today: string}) {
  if (!events.length) return <p className={styles.empty}>이 조건에 맞는 일정이 없어요.</p>;
  const groups: {date: string; events: PublicEvent[]}[] = [];
  for (const event of events) {
    const last = groups[groups.length - 1];
    if (last && last.date === event.startsOn) last.events.push(event);
    else groups.push({date: event.startsOn, events: [event]});
  }
  return (
    <div className={styles.dateGroups}>
      {groups.map((group) => (
        <section key={group.date} className={styles.dateGroup}>
          <h3 className={styles.dateGroupHead}>{dateHeading(group.date)}</h3>
          <ol className={styles.list}>
            {group.events.map((event) => (
              <li key={event.id}>
                <EventRow event={event} today={today} />
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
