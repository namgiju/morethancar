import type {Metadata} from 'next';
import {fetchEvPolicies} from '../../../lib/ev-server-api';
import CategoryListing from '../../../components/ev/category-listing';

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
  return <CategoryListing category="BUY" title="구매·지원" description="전기차 국고·지자체 보조금, 취득세·개별소비세 감면 등 구매 단계의 정책을 확인하세요." status={status} />;
}
