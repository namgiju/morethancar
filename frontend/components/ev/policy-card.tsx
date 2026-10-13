import type {EvPolicyCard} from '../../lib/ev-types';
import {SCOPE_LABELS, formatEndDate} from '../../lib/ev-format';
import StatusBadge from './status-badge';
import styles from './ev.module.css';

// 메인·구매·지원·운행·혜택 공용 목록 카드. 지시사항 §3 "주요 정책 카드" 필드: 정책명·핵심
// 혜택·정책 상태·적용 대상·최종 확인일. 전국 공통/지역 한정 표시를 일관되게 보여준다(지역별
// 금액을 추정하지 않는다 — regionNote가 있을 때만 그 문구를 그대로 보여준다).
export default function PolicyCard({policy}: {policy: EvPolicyCard}) {
  return (
    <a className={styles.card} href={`/ev/policy/${policy.slug}`}>
      <div className={styles.cardTags}>
        <StatusBadge status={policy.status} />
        <span className={styles.tag}>{SCOPE_LABELS[policy.scope]}</span>
      </div>
      <h3>{policy.title}</h3>
      <p>{policy.summary}</p>
      <div className={styles.cardMeta}>
        <span>적용 대상: {policy.target}</span>
        <span>종료: {formatEndDate(policy.endDate, policy.endDateIndefinite)}</span>
        <span>최종 확인일: {policy.lastVerifiedOn ?? '확인 중'}</span>
      </div>
    </a>
  );
}
