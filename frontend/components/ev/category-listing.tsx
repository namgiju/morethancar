import type {EvCategory} from '../../lib/ev-types';
import {fetchEvPolicies} from '../../lib/ev-server-api';
import {STATUS_FILTER_OPTIONS} from '../../lib/ev-format';
import PolicyCard from './policy-card';
import TabLinks from './tab-links';
import styles from './ev.module.css';

const TOP_TABS = [
  {key: 'all', label: '전체', href: '/ev'},
  {key: 'buy', label: '구매·지원', href: '/ev/buy'},
  {key: 'drive', label: '운행·혜택', href: '/ev/drive'},
  {key: 'changes', label: '정책 변경', href: '/ev/changes'},
];

// /ev/buy, /ev/drive가 공용으로 쓰는 본문 — 같은 목록 API를 category로만 다르게 필터링한다
// (지시: "구매·지원과 운행·혜택은 공통 목록을 카테고리로 필터링"). 전국 공통/지역 한정 표시는
// PolicyCard가 두 페이지에서 동일하게 보여준다(지역별 금액을 추정하지 않음).
export default async function CategoryListing({category, title, description, status}: {category: EvCategory; title: string; description: string; status?: string}) {
  const statusFilter = STATUS_FILTER_OPTIONS.find((f) => f.key === status) ?? STATUS_FILTER_OPTIONS[0];
  const policies = await fetchEvPolicies({category, status: statusFilter.status, limit: 100});
  const basePath = category === 'BUY' ? '/ev/buy' : '/ev/drive';

  return (
    <>
      <div className={styles.pageHead}>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <TabLinks items={TOP_TABS} active={category === 'BUY' ? 'buy' : 'drive'} />
      <TabLinks
        items={STATUS_FILTER_OPTIONS.map((f) => ({key: f.key, label: f.label, href: f.key === 'all' ? basePath : `${basePath}?status=${f.key}`}))}
        active={statusFilter.key}
      />
      {policies.length ? (
        <div className={styles.cardGrid}>
          {policies.map((p) => (
            <PolicyCard key={p.slug} policy={p} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>조건에 맞는 정책이 아직 없습니다.</p>
      )}
    </>
  );
}
