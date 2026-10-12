// Server Component data fetching only. Next's rewrite in next.config.ts only
// rewrites requests that hit this app's own HTTP server — a server-side
// `fetch` during SSR never goes through it, so this calls the backend origin
// directly. All endpoints used here are public (no auth middleware in
// board-service), so no session cookie needs to be forwarded.
import type {GarageEntry, Listing, Post, SiteStats} from './home-types';
import {kstToday} from './motorsport';
import type {PublicEvent} from './motorsport-types';

const API_ORIGIN = process.env.REVCC_API_ORIGIN || 'http://localhost:8090';

async function serverApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_ORIGIN}${path}`, {cache: 'no-store'});
  if (!res.ok) throw new Error(`요청을 처리하지 못했습니다. (${res.status})`);
  return res.json() as Promise<T>;
}

export async function fetchTodayPostsServer(
  params: {category?: string; period?: string; limit?: number} = {},
): Promise<Post[]> {
  const query = new URLSearchParams({sort: 'popular', limit: String(params.limit ?? 4)});
  if (params.category) query.set('category', params.category);
  if (params.period) query.set('period', params.period);
  return serverApi<Post[]>(`/api/board/posts?${query}`);
}

// "실시간 인기" 사이드바: assignment-frontend/js/community-list.js의 popular()와
// 동일한 호출(sort=popular, 기간 제한 없음)을 재사용한다. 새 API 없음.
export async function fetchPopularPostsServer(limit = 10): Promise<Post[]> {
  return serverApi<Post[]>(`/api/board/posts?sort=popular&limit=${limit}`);
}

// "방금 올라온 글": 같은 목록 API의 최신순.
export async function fetchLatestPostsServer(limit = 6): Promise<Post[]> {
  return serverApi<Post[]>(`/api/board/posts?sort=latest&limit=${limit}`);
}

// 메인 첫 화면의 회원·차량·게시글 수. 이미 있는 공개 집계 API를 그대로 쓴다.
export async function fetchSiteStatsServer(): Promise<SiteStats> {
  return serverApi<SiteStats>('/api/board/stats/summary');
}

export async function fetchPublicGarageServer(): Promise<GarageEntry[]> {
  return serverApi<GarageEntry[]>('/api/board/garage');
}

export async function fetchLatestListingsServer(limit = 2): Promise<{items: Listing[]; total: number}> {
  const query = new URLSearchParams({sort: 'latest', status: 'selling', limit: String(limit)});
  return serverApi<{items: Listing[]; total: number}>(`/api/parts/listings?${query}`);
}

// 메인 "모터스포츠 일정" 미리보기: 가장 가까운 예정 일정 N개. 공개 API는 한 번에
// 최대 92일만 조회하므로(motorsport.js MAX_RANGE_DAYS), 오늘부터 92일 구간을
// 그대로 쓴다(이벤트는 정렬된 상태로 오므로 앞에서 N개만 쓰면 된다).
export async function fetchUpcomingMotorsportServer(limit = 3): Promise<PublicEvent[]> {
  const from = kstToday();
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + 92 * 86_400_000).toISOString().slice(0, 10);
  const query = new URLSearchParams({from, to, limit: String(limit)});
  const {events} = await serverApi<{events: PublicEvent[]}>(`/api/board/motorsport/events?${query}`);
  return events;
}
