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
    {'@type': 'ListItem', position: 3, name: '운행·혜택', item: `${BASE_URL}/ev/drive`},
  ],
};

export async function generateMetadata(): Promise<Metadata> {
  let empty = true;
  try {
    empty = (await fetchEvPolicies({category: 'DRIVE', limit: 1})).length === 0;
  } catch {
    empty = true;
  }
  return {
    title: '운행·혜택',
    description: '고속도로 통행료 할인, 공영주차장 할인, 충전 요금 등 운행 중 적용되는 전기차 혜택을 확인하세요.',
    alternates: {canonical: 'https://morethancar.kr/ev/drive'},
    robots: empty ? {index: false, follow: true} : undefined,
  };
}

export default async function EvDrivePage({searchParams}: {searchParams: Promise<{status?: string}>}) {
  const {status} = await searchParams;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: toJsonLd(breadcrumbJsonLd)}} />
      <CategoryListing category="DRIVE" title="운행·혜택" description="고속도로 통행료 할인, 공영주차장 할인, 충전 요금 등 운행 단계의 혜택을 확인하세요." status={status} />
    </>
  );
}
