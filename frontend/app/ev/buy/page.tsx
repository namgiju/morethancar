import type {Metadata} from 'next';
import {fetchEvPolicies} from '../../../lib/ev-server-api';
import {toJsonLd} from '../../../lib/json-ld';
import CategoryListing from '../../../components/ev/category-listing';

const BASE_URL = 'https://morethancar.kr';
const breadcrumbJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    {'@type': 'ListItem', position: 1, name: 'morethancar', item: `${BASE_URL}/`},
    {'@type': 'ListItem', position: 2, name: '전기차 정책·혜택', item: `${BASE_URL}/ev`},
    {'@type': 'ListItem', position: 3, name: '구매·지원', item: `${BASE_URL}/ev/buy`},
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  let empty = true;
  try {
    empty = (await fetchEvPolicies({category: 'BUY', limit: 1})).length === 0;
  } catch {
    empty = true;
  }
  return {
    title: '구매·지원',
    description: '전기차 국고·지자체 보조금, 취득세·개별소비세 감면 등 구매·지원 정책을 확인하세요.',
    alternates: {canonical: 'https://morethancar.kr/ev/buy'},
    robots: empty ? {index: false, follow: true} : undefined,
  };
}

export default async function EvBuyPage({searchParams}: {searchParams: Promise<{status?: string}>}) {
  const {status} = await searchParams;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: toJsonLd(breadcrumbJsonLd)}} />
      <CategoryListing category="BUY" title="구매·지원" description="전기차 국고·지자체 보조금, 취득세·개별소비세 감면 등 구매 단계의 정책을 확인하세요." status={status} />
    </>
  );
}
