import {FlagIcon} from '../common/icons';
import {dateRangeLabel} from '../../lib/motorsport';
import {KIND_LABELS, type PublicEvent} from '../../lib/motorsport-types';
import {motorsportUrl} from '../../lib/format';
import styles from './main.module.css';

// "모터스포츠 일정" 미리보기: /motorsport와 같은 공개 API(가장 가까운 예정 일정부터)를
// 서버에서 미리 읽어 온다(lib/server-api.ts의 fetchUpcomingMotorsportServer). 데이터가
// 없으면(아직 등록된 일정이 없음) 가짜 일정 대신 섹션이 다루는 범위를 안내한다.
export default function MotorsportPreview({events}: {events: PublicEvent[]}) {
  return (
    <section className={styles.lowerPanel} aria-labelledby="motorsport-title">
      <div className={styles.panelHead}>
        <h2 id="motorsport-title">모터스포츠 일정</h2>
        <a href="/motorsport">전체 보기 →</a>
      </div>
      {events.length ? (
        <ol className={styles.eventList}>
          {events.map((e) => (
            <li key={e.id}>
              <a href={motorsportUrl(e.id)} className={styles.eventRow}>
                <span className={styles.eventDate}>{dateRangeLabel(e.startsOn, e.endsOn)}</span>
                <span className={styles.tag}>{KIND_LABELS[e.kind]}</span>
                <span className={styles.eventBody}>
                  <strong>{e.series ? e.series.name : KIND_LABELS[e.kind]}</strong> {e.title}
                  <small>
                    {e.venue.name}
                    {e.venue.region ? ` · ${e.venue.region}` : ''}
                  </small>
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
