'use client';

import {useEffect, useState} from 'react';
import {ApiError, fetchEvent} from '../../lib/motorsport-api';
import {countryName, dateRangeLabel, eventPhase, kstToday, kstTimeLabel} from '../../lib/motorsport';
import {KIND_LABELS, PHASE_LABELS, SCOPE_LABELS, type PublicEvent} from '../../lib/motorsport-types';
import styles from './motorsport.module.css';

const STATUS_NOTE: Record<PublicEvent['status'], string | null> = {
  SCHEDULED: null,
  TENTATIVE: '주최 측이 아직 세부 일정을 확정하지 않았어요.',
  CHANGED: '처음 공지된 일정에서 바뀌었어요.',
  CANCELLED: '이 일정은 취소됐어요.',
};

export default function MotorsportDetail({id}: {id: number}) {
  const [event, setEvent] = useState<PublicEvent | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchEvent(id)
      .then((data) => active && setEvent(data))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : '일정을 불러오지 못했어요.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div>
      <a href="/motorsport" className={styles.backLink}>
        ← 모터스포츠 일정으로
      </a>

      {loading ? (
        <p className={styles.empty}>불러오는 중이에요.</p>
      ) : error || !event ? (
        <p className={styles.empty}>{error || '일정을 찾을 수 없어요.'}</p>
      ) : (
        <EventDetailBody event={event} />
      )}
    </div>
  );
}

function EventDetailBody({event}: {event: PublicEvent}) {
  const today = kstToday();
  const phase = eventPhase(event, today);
  const statusNote = STATUS_NOTE[event.status];

  return (
    <article className={styles.detailPanel}>
      <div className={styles.detailTags}>
        <span className={styles.tag}>{KIND_LABELS[event.kind]}</span>
        <span className={`${styles.phaseTag} ${styles[`phase-${phase}`]}`}>{PHASE_LABELS[phase]}</span>
        {event.series && <span className={styles.tag}>{SCOPE_LABELS[event.series.scope]}</span>}
        {statusNote && <span className={styles.statusTag}>{event.status === 'CANCELLED' ? '취소' : event.status === 'CHANGED' ? '일정 변경' : '잠정'}</span>}
      </div>

      <h1 className={styles.detailTitle}>{event.title}</h1>
      {event.series && <p className={styles.detailSeries}>{event.series.name}</p>}
      {statusNote && <p className={styles.detailStatusNote}>{statusNote}</p>}

      <dl className={styles.detailMeta}>
        <div>
          <dt>종목</dt>
          <dd>{KIND_LABELS[event.kind]}</dd>
        </div>
        <div>
          <dt>개최 장소</dt>
          <dd>
            {event.venue.name}
            {event.venue.region ? ` · ${event.venue.region}` : ''}
          </dd>
        </div>
        <div>
          <dt>개최 국가</dt>
          <dd>{countryName(event.venue.country)}</dd>
        </div>
        <div>
          <dt>일시</dt>
          <dd>
            {dateRangeLabel(event.startsOn, event.endsOn)}
            {event.startsAt && ` · ${kstTimeLabel(event.startsAt)} (KST)`}
          </dd>
        </div>
      </dl>

      {event.note && (
        <div className={styles.detailNote}>
          <h2>경기 설명</h2>
          <p>{event.note}</p>
        </div>
      )}

      {event.sourceUrl && (
        <a className={styles.detailLink} href={event.sourceUrl} target="_blank" rel="noopener noreferrer">
          공식 홈페이지 · {event.sourceName} ↗
        </a>
      )}

      <p className={styles.detailFoot}>
        {event.verifiedOn} 공식 출처 확인{event.linkedPostCount > 0 && ` · 이 일정에 관한 이야기 ${event.linkedPostCount}개`}
      </p>
    </article>
  );
}
