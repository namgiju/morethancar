import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {fetchEvPolicyDetail} from '../../../../lib/ev-server-api';
import {CATEGORY_LABELS, SCOPE_LABELS} from '../../../../lib/ev-format';
import {kstToday} from '../../../../lib/motorsport';
import {toJsonLd} from '../../../../lib/json-ld';
import VersionDetail from '../../../../components/ev/version-detail';
import styles from '../../../../components/ev/ev.module.css';

const BASE_URL = 'https://morethancar.kr';
const CATEGORY_PATH = {BUY: '/ev/buy', DRIVE: '/ev/drive'} as const;

type Params = {slug: string};

// generateMetadata와 페이지 둘 다 같은 slug로 fetchEvPolicyDetail을 부르지만, Next.js가 같은
// fetch(URL, options)를 같은 요청 안에서 자동으로 중복 제거한다(실제로 두 번 호출되지 않음).
export async function generateMetadata({params}: {params: Promise<Params>}): Promise<Metadata> {
  const {slug} = await params;
  try {
    const policy = await fetchEvPolicyDetail(slug);
    if (!policy) return {title: '정책을 찾을 수 없음', robots: {index: false, follow: false}};
    return {
      title: policy.title,
      description: policy.current.summary,
      alternates: {canonical: `https://morethancar.kr/ev/policy/${policy.slug}`},
    };
  } catch {
    // API 장애 중에는 메타데이터를 단정하지 않는다 — 본문은 페이지 자체의 fetch가 실패해 error.tsx로 넘어간다.
    return {title: '전기차 정책', robots: {index: false, follow: true}};
  }
}

export default async function EvPolicyDetailPage({params}: {params: Promise<Params>}) {
  const {slug} = await params;
  const policy = await fetchEvPolicyDetail(slug);
  if (!policy) notFound();
  const today = kstToday();

  const canonicalUrl = `${BASE_URL}/ev/policy/${policy.slug}`;
  // 정부·지자체가 제공하는 보조금·혜택 제도라 schema.org의 GovernmentService가 가장 맞는 타입이다.
  // areaServed/provider는 policy.scope·regionNote(둘 다 DB에 실제 입력된 값)만 쓰고, 확인되지
  // 않은 특정 기관명을 임의로 지어내지 않는다(요구사항 9).
  const serviceJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'GovernmentService',
    name: policy.title,
    description: policy.current.summary,
    serviceType: CATEGORY_LABELS[policy.category],
    areaServed: policy.scope === 'NATIONAL' ? '대한민국' : policy.regionNote ?? undefined,
    provider: {'@type': 'GovernmentOrganization', name: policy.scope === 'NATIONAL' ? '대한민국 정부' : '지방자치단체'},
    url: canonicalUrl,
    ...(policy.current.lastVerifiedOn ? {dateModified: policy.current.lastVerifiedOn} : {}),
  };
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'morethancar', item: `${BASE_URL}/`},
      {'@type': 'ListItem', position: 2, name: '전기차 정책·혜택', item: `${BASE_URL}/ev`},
      {'@type': 'ListItem', position: 3, name: CATEGORY_LABELS[policy.category], item: `${BASE_URL}${CATEGORY_PATH[policy.category]}`},
      {'@type': 'ListItem', position: 4, name: policy.title, item: canonicalUrl},
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: toJsonLd(serviceJsonLd)}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: toJsonLd(breadcrumbJsonLd)}} />
      <div className={styles.detailHead}>
        <a href="/ev">← 전기차 정책·혜택</a>
        <div className={`${styles.cardTags} ${styles.detailTags}`}>
          <span className={styles.tag}>{CATEGORY_LABELS[policy.category]}</span>
          <span className={styles.tag}>{SCOPE_LABELS[policy.scope]}</span>
        </div>
        <h1>{policy.title}</h1>
        {policy.scope === 'REGIONAL' && policy.regionNote && <p className={styles.bodyText}>{policy.regionNote}</p>}
      </div>

      <section className={styles.section}>
        <h2>현재 내용</h2>
        <VersionDetail version={policy.current} today={today} />
      </section>

      {policy.upcomingChanges.length > 0 && (
        <section className={styles.section}>
          <h2>공개된 예정 변경</h2>
          <div className={styles.timeline}>
            {policy.upcomingChanges.map((v) => (
              <VersionDetail key={v.versionNo} version={v} today={today} />
            ))}
          </div>
        </section>
      )}

      <section className={styles.section}>
        <h2>변경 이력</h2>
        <div className={styles.timeline}>
          {policy.history.map((v) => (
            <VersionDetail key={v.versionNo} version={v} today={today} />
          ))}
        </div>
      </section>

      {policy.relatedPolicies.length > 0 && (
        <section className={styles.section}>
          <h2>관련 정책</h2>
          <div className={styles.relatedGrid}>
            {policy.relatedPolicies.map((r) => (
              <a key={r.slug} className={styles.card} href={`/ev/policy/${r.slug}`}>
                <h3>{r.title}</h3>
                <p>{r.summary}</p>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
