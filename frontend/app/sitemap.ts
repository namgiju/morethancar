import type {MetadataRoute} from 'next';
import {fetchEvPolicies} from '../lib/ev-server-api';

const BASE_URL = 'https://morethancar.kr';

// 이번 라운드(STEP 9)는 전기차 정책 허브만 다룬다 — 커뮤니티·모터스포츠·스팟 등 다른 영역의
// 공개 URL은 이 세션에서 그 쿼리·공개 범위를 검증하지 않았으므로 추측해서 넣지 않는다.
// 사이트 전체 사이트맵으로 넓히는 작업은 해당 영역을 다루는 별도 라운드의 몫으로 남긴다.
const STATIC_ENTRIES: MetadataRoute.Sitemap = [
  {url: `${BASE_URL}/`, changeFrequency: 'daily', priority: 1},
  {url: `${BASE_URL}/ev`, changeFrequency: 'daily', priority: 0.8},
  {url: `${BASE_URL}/ev/buy`, changeFrequency: 'weekly', priority: 0.7},
  {url: `${BASE_URL}/ev/drive`, changeFrequency: 'weekly', priority: 0.7},
  {url: `${BASE_URL}/ev/changes`, changeFrequency: 'daily', priority: 0.6},
];

// fetchEvPolicies가 쓰는 fetch(cache:'no-store')가 이 라우트를 자동으로 동적 렌더링
// 대상으로 만든다(요청마다 다시 실행, 빌드 시점에 고정되지 않음).
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  let policies: Awaited<ReturnType<typeof fetchEvPolicies>> = [];
  try {
    policies = await fetchEvPolicies({limit: 200});
  } catch {
    // API 장애 중에는 정책 상세 URL을 비워 둔다 — 존재 여부를 확인하지 못한 slug를
    // 추측해서 넣지 않는다(공개 API는 PUBLISHED·검증된 버전만 돌려준다).
    policies = [];
  }

  const policyEntries: MetadataRoute.Sitemap = policies.map((policy) => ({
    url: `${BASE_URL}/ev/policy/${policy.slug}`,
    lastModified: policy.lastVerifiedOn ?? undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }));

  return [...STATIC_ENTRIES, ...policyEntries];
}
