import type {Metadata} from 'next';
import {fetchEvChanges, fetchEvPolicies} from '../../lib/ev-server-api';
import {STATUS_FILTER_OPTIONS, dDay, dDayLabel} from '../../lib/ev-format';
import {toJsonLd} from '../../lib/json-ld';
import PolicyCard from '../../components/ev/policy-card';
import TabLinks from '../../components/ev/tab-links';
import StatusBadge from '../../components/ev/status-badge';
import styles from '../../components/ev/ev.module.css';

const BASE_URL = 'https://morethancar.kr';
const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {'@type': 'ListItem', position: 1, name: 'morethancar', item: `${BASE_URL}/`},
    {'@type': 'ListItem', position: 2, name: '전기차 정책·혜택', item: `${BASE_URL}/ev`},
  ],
};

const TOP_TABS = [
  {key: 'all', label: '전체', href: '/ev'},
  {key: 'buy', label: '구매·지원', href: '/ev/buy'},
  {key: 'drive', label: '운행·혜택', href: '/ev/drive'},
  {key: 'changes', label: '정책 변경', href: '/ev/changes'},
];

export async function generateMetadata(): Promise<Metadata> {
  let empty = true;
  try {
    const policies = await fetchEvPolicies({limit: 1});
    empty = policies.length === 0;
  } catch {
    empty = true;
  }
  return {
    title: '전기차 정책·혜택',
    description: '구매부터 운행까지, 달라지는 전기차 제도를 한눈에 확인하세요.',
    alternates: {canonical: 'https://morethancar.kr/ev'},
    robots: empty ? {index: false, follow: true} : undefined,
  };
}

export default async function EvMainPage({searchParams}: {searchParams: Promise<{status?: string}>}) {
  const {status} = await searchParams;
  const statusFilter = STATUS_FILTER_OPTIONS.find((f) => f.key === status) ?? STATUS_FILTER_OPTIONS[0];

  const [featured, upcoming, recent, listed] = await Promise.all([
    fetchEvPolicies({featured: true, limit: 6}),
    fetchEvChanges({filter: 'scheduled', limit: 5}),
    fetchEvChanges({limit: 5}),
    fetchEvPolicies({status: statusFilter.status, limit: 50}),
  ]);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: toJsonLd(breadcrumbJsonLd)}} />
      <div className={styles.pageHead}>
        <h1>전기차 정책·혜택</h1>
        <p>구매부터 운행까지, 달라지는 전기차 제도를 한눈에 확인하세요.</p>
      </div>

      <TabLinks items={TOP_TABS} active="all" />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>주요 정책</h2>
        </div>
        {featured.length ? (
          <div className={styles.cardGrid}>
            {featured.map((p) => (
              <PolicyCard key={p.slug} policy={p} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>아직 주요 정책으로 지정된 항목이 없습니다.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>곧 달라지는 정책</h2>
          <a href="/ev/changes?filter=scheduled">정책 변경 타임라인 →</a>
        </div>
        {upcoming.changes.length ? (
          <ul className={styles.timeline}>
            {upcoming.changes.map((c) => {
              const days = dDay(c.effectiveDate, upcoming.today);
              return (
                <li key={`${c.slug}-${c.versionNo}`} className={styles.card}>
                  <div className={styles.cardTags}>
                    <StatusBadge status={c.status} />
                    {days !== null && days >= 0 && <span className={styles.tag}>{dDayLabel(days)}</span>}
                  </div>
                  <h3>
                    <a href={`/ev/policy/${c.slug}`}>{c.title}</a>
                  </h3>
                  <p>{c.changeSummary ?? c.summary}</p>
                  <div className={styles.cardMeta}>
                    <span>시행 예정일: {c.effectiveDate}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className={styles.empty}>확정되어 공개된 시행 예정 변경이 아직 없습니다.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>최근 변경된 정책</h2>
          <a href="/ev/changes">전체 변경 이력 →</a>
        </div>
        {recent.changes.length ? (
          <ul className={styles.timeline}>
            {recent.changes.map((c) => (
              <li key={`${c.slug}-${c.versionNo}`} className={styles.card}>
                <div className={styles.cardTags}>
                  <StatusBadge status={c.status} />
                </div>
                <h3>
                  <a href={`/ev/policy/${c.slug}`}>{c.title}</a>
                </h3>
                <p>{c.changeSummary ?? c.summary}</p>
                <div className={styles.cardMeta}>
                  <span>{c.effectiveDate ?? c.announcedOn ?? '날짜 미정'}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>최근 변경된 정책이 아직 없습니다.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>전체 정책 목록</h2>
        </div>
        <TabLinks items={STATUS_FILTER_OPTIONS.map((f) => ({key: f.key, label: f.label, href: f.key === 'all' ? '/ev' : `/ev?status=${f.key}`}))} active={statusFilter.key} />
        {listed.length ? (
          <div className={styles.cardGrid}>
            {listed.map((p) => (
              <PolicyCard key={p.slug} policy={p} />
            ))}
          </div>
        ) : (
          <p className={styles.empty}>조건에 맞는 정책이 없습니다.</p>
        )}
      </section>
    </>
  );
}
