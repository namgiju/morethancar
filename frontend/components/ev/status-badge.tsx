import type {EvStatus} from '../../lib/ev-types';
import {STATUS_LABELS} from '../../lib/ev-format';
import styles from './ev.module.css';

// 상태 배지 하나로 PROPOSED를 확정 정책처럼 보이지 않게 한다 — 라벨 자체가 "검토 중·미확정"이다.
export default function StatusBadge({status}: {status: EvStatus}) {
  const cls =
    status === 'ACTIVE' ? styles.tagActive : status === 'PROPOSED' ? styles.tagProposed : status === 'EXPIRED' ? styles.tagExpired : styles.tag;
  return <span className={`${styles.tag} ${cls}`}>{STATUS_LABELS[status]}</span>;
}

// "시행일/종료일이 지났는데 상태가 안 바뀜" — 확정 시행으로 추정하지 않고 재확인 필요만 표시.
export function NeedsReviewBadge() {
  return <span className={`${styles.tag} ${styles.tagWarn}`}>재확인 필요</span>;
}

export function CancelledBadge() {
  return <span className={`${styles.tag} ${styles.tagCancelled}`}>취소됨</span>;
}
