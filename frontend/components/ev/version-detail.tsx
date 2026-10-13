import type {ReactNode} from 'react';
import type {EvVersion} from '../../lib/ev-types';
import {dDay, dDayLabel, formatDate, formatEndDate} from '../../lib/ev-format';
import StatusBadge, {CancelledBadge, NeedsReviewBadge} from './status-badge';
import SourceList from './source-list';
import styles from './ev.module.css';

// 버전 하나(현재·공개된 예정 변경·이력·타임라인 항목)를 보여주는 공용 블록. heading을 주면 그
// 위에 붙인다(타임라인에서 정책명 링크를 보여줄 때 씀). D-day는 "확정된 미래 날짜에만" 표시한다
// — status==='SCHEDULED'이고 changeConfirmed이고 effectiveDate가 있고 아직 안 지났을 때만
// 계산한다(원 지시의 D-day 계약).
export default function VersionDetail({version: v, today, heading}: {version: EvVersion; today: string; heading?: ReactNode}) {
  const days = v.status === 'SCHEDULED' && v.changeConfirmed ? dDay(v.effectiveDate, today) : null;

  return (
    <article className={styles.versionBlock}>
      {heading}
      <div className={styles.cardTags}>
        <StatusBadge status={v.status} />
        {v.cancelled && <CancelledBadge />}
        {v.needsReview && <NeedsReviewBadge />}
        {days !== null && days >= 0 && <span className={styles.tag}>{dDayLabel(days)}</span>}
      </div>

      {v.cancelled && v.cancellationNote && (
        <p className={styles.bodyText}>
          <strong>취소됨:</strong> {v.cancellationNote}
        </p>
      )}

      <p className={styles.bodyText}>{v.summary}</p>

      <dl className={styles.fieldGrid}>
        <div className={styles.field}>
          <dt>적용 대상</dt>
          <dd>{v.target}</dd>
        </div>
        <div className={styles.field}>
          <dt>시행일</dt>
          <dd>{formatDate(v.effectiveDate)}</dd>
        </div>
        <div className={styles.field}>
          <dt>종료일</dt>
          <dd>{formatEndDate(v.endDate, v.endDateIndefinite)}</dd>
        </div>
        <div className={styles.field}>
          <dt>최종 확인일</dt>
          <dd>{v.lastVerifiedOn ?? '확인 중'}</dd>
        </div>
      </dl>

      <p className={styles.bodyText}>
        <strong>핵심 내용</strong>
        <br />
        {v.keyPoints}
      </p>
      <p className={styles.bodyText}>
        <strong>지원 내용·혜택</strong>
        <br />
        {v.benefit}
      </p>
      <p className={styles.bodyText}>
        <strong>신청·이용 방법</strong>
        <br />
        {v.howToApply}
      </p>
      {v.note && <p className={styles.bodyText}>{v.note}</p>}

      <SourceList sources={v.sources} />

      {v.revisionKind !== 'INITIAL' && (
        <div className={styles.compare}>
          {v.changeSummary && (
            <p>
              <strong>변경 내용:</strong> {v.changeSummary}
            </p>
          )}
          {v.previousVersion ? (
            <p>
              이전 버전(v{v.previousVersion.versionNo}): {v.previousVersion.summary}
            </p>
          ) : (
            <p>{v.previousVersionNote ?? '이전 버전 비교 정보가 없습니다.'}</p>
          )}
        </div>
      )}
    </article>
  );
}
