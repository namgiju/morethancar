import type {Metadata} from 'next';
import {fetchEvChanges} from '../../../lib/ev-server-api';
import {CHANGE_FILTER_LABELS} from '../../../lib/ev-format';
import TabLinks from '../../../components/ev/tab-links';
import VersionDetail from '../../../components/ev/version-detail';
import type {EvChangeFilter} from '../../../lib/ev-types';
import styles from '../../../components/ev/ev.module.css';

const FILTERS: {key: string; label: string; filter?: EvChangeFilter}[] = [
  {key: 'all', label: '전체'},
  {key: 'scheduled', label: CHANGE_FILTER_LABELS.scheduled, filter: 'scheduled'},
  {key: 'recent', label: CHANGE_FILTER_LABELS.recent, filter: 'recent'},
  {key: 'ending', label: CHANGE_FILTER_LABELS.ending, filter: 'ending'},
  {key: 'expired', label: CHANGE_FILTER_LABELS.expired, filter: 'expired'},
  {key: 'proposed', label: CHANGE_FILTER_LABELS.proposed, filter: 'proposed'},
];

export async function generateMetadata(): Promise<Metadata> {
  let empty = true;
  try {
    empty = (await fetchEvChanges({limit: 1})).changes.length === 0;
  } catch {
    empty = true;
  }
  return {
    title: '정책 변경',
    description: '전기차 정책의 이전·이후 내용을 비교해 보여주는 변경 타임라인입니다.',
    alternates: {canonical: 'https://morethancar.kr/ev/changes'},
    robots: empty ? {index: false, follow: true} : undefined,
  };
}

// 뉴스 목록이 아니라 이전/이후 비교 타임라인이다(VersionDetail이 previousVersion을 비교 형태로
// 보여준다). D-day는 VersionDetail 내부에서 "확정된 미래 날짜일 때만" 계산한다.
export default async function EvChangesPage({searchParams}: {searchParams: Promise<{filter?: string}>}) {
  const {filter} = await searchParams;
  const active = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];
  const {today, changes} = await fetchEvChanges({filter: active.filter, limit: 100});

  return (
    <>
      <div className={styles.pageHead}>
        <h1>정책 변경</h1>
        <p>전기차 정책이 이전에 무엇이었고 지금 무엇으로 바뀌었는지, 확정 여부와 함께 확인하세요.</p>
      </div>

      <TabLinks items={FILTERS.map((f) => ({key: f.key, label: f.label, href: f.key === 'all' ? '/ev/changes' : `/ev/changes?filter=${f.key}`}))} active={active.key} />

      {changes.length ? (
        <div className={styles.timeline}>
          {changes.map((c) => (
            <VersionDetail
              key={`${c.slug}-${c.versionNo}`}
              version={c}
              today={today}
              heading={
                <h3>
                  <a href={`/ev/policy/${c.slug}`}>{c.title}</a>
                </h3>
              }
            />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>조건에 맞는 변경 이력이 아직 없습니다.</p>
      )}
    </>
  );
}
