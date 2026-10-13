// Server Component 전용 데이터 패칭(frontend/lib/server-api.ts와 같은 패턴) — board-service의
// /api/board/ev/* 공개 엔드포인트를 서버에서 직접 호출한다. 전부 로그인이 필요 없는 공개 API라
// 쿠키를 넘기지 않는다(사용자 세션을 공개 API에 전달하지 않음 — API_ORIGIN은 서버 전용이고
// 클라이언트 코드에서 이 파일을 쓰지 않는다).
//
// 오류 구분(중요): 존재하지 않거나 비공개인 정책은 404를 "정상적으로 없음"으로 다뤄 null을
// 돌려준다(호출부가 notFound()를 부른다). 그 외 실패(네트워크 오류, 5xx, 잘못된 응답)는
// 그대로 throw한다 — 호출부가 삼키지 않고 Next.js의 error.tsx(재시도 가능한 오류 화면)로
// 넘어가게 한다. "정상적으로 비어 있는 목록"과 "오류로 못 가져온 목록"을 섞지 않는다.
import type {EvCategory, EvChangeFilter, EvChangesResponse, EvPolicyCard, EvPolicyDetail, EvStatus} from './ev-types';

const API_ORIGIN = process.env.REVCC_API_ORIGIN || 'http://localhost:8090';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${path}`, {cache: 'no-store'});
  if (!res.ok) throw new Error(`전기차 정책 정보를 불러오지 못했습니다. (${res.status})`);
  return res.json() as Promise<T>;
}

export async function fetchEvPolicies(
  params: {category?: EvCategory; status?: EvStatus; featured?: boolean; q?: string; limit?: number} = {},
): Promise<EvPolicyCard[]> {
  const query = new URLSearchParams();
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  if (params.featured !== undefined) query.set('featured', String(params.featured));
  if (params.q) query.set('q', params.q);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  const {policies} = await getJson<{policies: EvPolicyCard[]}>(`/api/board/ev/policies${qs ? `?${qs}` : ''}`);
  return policies;
}

// 없거나 비공개인 정책은 null(호출부가 notFound() 처리). 그 외 실패는 throw.
export async function fetchEvPolicyDetail(slug: string): Promise<EvPolicyDetail | null> {
  const res = await fetch(`${API_ORIGIN}/api/board/ev/policies/${encodeURIComponent(slug)}`, {cache: 'no-store'});
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`전기차 정책 정보를 불러오지 못했습니다. (${res.status})`);
  return res.json() as Promise<EvPolicyDetail>;
}

export async function fetchEvChanges(params: {filter?: EvChangeFilter; limit?: number} = {}): Promise<EvChangesResponse> {
  const query = new URLSearchParams();
  if (params.filter) query.set('filter', params.filter);
  if (params.limit) query.set('limit', String(params.limit));
  const qs = query.toString();
  return getJson<EvChangesResponse>(`/api/board/ev/changes${qs ? `?${qs}` : ''}`);
}
