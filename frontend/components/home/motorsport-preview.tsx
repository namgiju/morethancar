import {FlagIcon} from '../common/icons';
import styles from './main.module.css';

// One schedule entry. Track days (서킷 스포츠주행 가능일) and spectator races are
// kept apart by `kind`, and every entry carries its official link. There is no
// data source yet, so the main page passes an empty list.
export type MotorsportEvent = {
  id: string;
  kind: 'track-day' | 'race';
  series: string;
  title: string;
  venue: string;
  startDate: string; // YYYY-MM-DD (KST)
  endDate?: string;
  officialUrl: string;
};

const KIND_LABELS: Record<MotorsportEvent['kind'], string> = {'track-day': '주행일', race: '경기'};

function dateLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${m}.${d}`;
}

// "주요 모터스포츠 일정" preview. With no verified schedule data it shows what the
// section will cover instead of placeholder dates — no fake events are shown.
export default function MotorsportPreview({events}: {events: MotorsportEvent[]}) {
  return (
    <section className={styles.lowerPanel} aria-labelledby="motorsport-title">
      <div className={styles.panelHead}>
        <h2 id="motorsport-title">
          모터스포츠 일정 {!events.length && <small className={styles.soonTag}>오픈 예정</small>}
        </h2>
      </div>
      {events.length ? (
        <ol className={styles.eventList}>
          {events.map((e) => (
            <li key={e.id}>
              <a href={e.officialUrl} target="_blank" rel="noopener noreferrer" className={styles.eventRow}>
                <span className={styles.eventDate}>
                  {dateLabel(e.startDate)}
                  {e.endDate && e.endDate !== e.startDate ? ` – ${dateLabel(e.endDate)}` : ''}
                </span>
                <span className={styles.tag}>{KIND_LABELS[e.kind]}</span>
                <span className={styles.eventBody}>
                  <strong>{e.series}</strong> {e.title}
                  <small>{e.venue}</small>
                </span>
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <div className={styles.motorsportEmpty}>
          <FlagIcon size={28} className={styles.shortcutIcon} />
          <p>
            서킷 스포츠주행 가능일과 F1 · WEC · 국내 레이스 일정을 한곳에서 확인할 수 있도록 준비하고 있어요.
          </p>
          <ul className={styles.plannedList} aria-label="제공 예정 일정">
            <li>서킷 주행일</li>
            <li>F1</li>
            <li>WEC</li>
            <li>국내 레이스</li>
          </ul>
          <small>검증된 일정과 공식 홈페이지·예약 링크만 등록할 예정입니다.</small>
        </div>
      )}
    </section>
  );
}
