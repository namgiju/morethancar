import {
  fetchLatestPostsServer,
  fetchPublicGarageServer,
  fetchSiteStatsServer,
  fetchTodayPostsServer,
  fetchUpcomingMotorsportServer,
} from '../lib/server-api';
import {pickGarageShowcase} from '../lib/format';
import type {BoardPeriod, Post} from '../lib/home-types';
import HomeShell from '../components/home/home-shell';

export const metadata = {
  title: 'morethancar | 차, 그 이상의 이야기',
  description: '자동차와 모터스포츠를 좋아하는 사람들이 정보와 경험을 나누는 곳, morethancar.',
};

// 모든 섹션이 매 요청마다 최신 데이터를 보여준다(세션 없이도 보이는 공개 데이터라
// 캐시로 얻을 이득이 적고, "오늘의 차고"는 날짜가 바뀌면 다른 차량을 보여줘야 한다).
export const dynamic = 'force-dynamic';

const BOARD_SIZE = 5;

// TIMING BOARD 첫 표시 기간: 오늘 글이 없으면 7일, 그래도 없으면 전체로 넓힌다.
// 화면의 기간 탭이 실제로 쓴 기간을 그대로 보여주므로 기준이 숨겨지지 않는다.
async function loadBoard(): Promise<{period: BoardPeriod; posts: Post[]}> {
  let last: {period: BoardPeriod; posts: Post[]} = {period: 'today', posts: []};
  for (const period of ['today', 'week', ''] as const) {
    const posts = await fetchTodayPostsServer({period: period || undefined, limit: BOARD_SIZE});
    last = {period, posts};
    if (posts.length) break;
  }
  return last;
}

export default async function Page() {
  const [boardResult, latestResult, garageResult, statsResult, motorsportResult] = await Promise.allSettled([
    loadBoard(),
    fetchLatestPostsServer(6),
    fetchPublicGarageServer(),
    fetchSiteStatsServer(),
    fetchUpcomingMotorsportServer(3),
  ]);

  return (
    <HomeShell
      renderedAt={Date.now()}
      initialBoard={boardResult.status === 'fulfilled' ? boardResult.value : {period: 'today', posts: []}}
      initialBoardFailed={boardResult.status === 'rejected'}
      latestPosts={latestResult.status === 'fulfilled' ? latestResult.value : null}
      garage={garageResult.status === 'fulfilled' ? pickGarageShowcase(garageResult.value, 3) : []}
      stats={statsResult.status === 'fulfilled' ? statsResult.value : null}
      motorsportEvents={motorsportResult.status === 'fulfilled' ? motorsportResult.value : []}
    />
  );
}
