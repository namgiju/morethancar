'use client';

import type {BoardPeriod, GarageEntry, Post, SiteStats} from '../../lib/home-types';
import type {PublicEvent} from '../../lib/motorsport-types';
import {compactCount} from '../../lib/format';
import SiteFooter from '../footer/site-footer';
import SiteHeader from '../common/site-header';
import TimingBoard from '../common/timing-board';
import theme from '../common/theme.module.css';
import {useCommunitySession} from '../community/use-community-session';
import LatestPosts from './latest-posts';
import ServiceShortcuts from './service-shortcuts';
import GarageShowcase from './garage-showcase';
import MotorsportPreview from './motorsport-preview';
import styles from './main.module.css';

// Main page (/). First screen = brand message + TIMING BOARD + newest posts
// side by side, so visitors see what the community is talking about without
// scrolling past a big banner. Below: service shortcuts, 오늘의 차고 and the
// motorsport schedule preview. The parts market section was removed while the
// market is paused (its code is kept: components/home/market-spotlight.tsx).
export default function HomeShell({
  renderedAt,
  initialBoard,
  initialBoardFailed,
  latestPosts,
  garage,
  stats,
  motorsportEvents,
}: {
  renderedAt: number;
  initialBoard: {period: BoardPeriod; posts: Post[]};
  initialBoardFailed: boolean;
  latestPosts: Post[] | null;
  garage: GarageEntry[];
  stats: SiteStats | null;
  motorsportEvents: PublicEvent[];
}) {
  const auth = useCommunitySession();
  const {session, sessionError} = auth;

  return (
    <div className={`${theme.theme} ${styles.shell}`}>
      <SiteHeader auth={auth} />

      {sessionError && (
        <p className={styles.notice} role="status">
          로그인 상태를 확인하지 못했어요. 새로고침해주세요.
        </p>
      )}

      <main className={styles.main}>
        <div className={styles.firstScreen}>
          <section className={styles.brand} aria-labelledby="brand-title">
            <p className={styles.eyebrow}>MORE THAN A CAR</p>
            <h1 id="brand-title" className={styles.brandTitle}>
              차, 그 이상의
              <br />
              이야기.
            </h1>
            <p className={styles.brandLead}>
              자동차와 모터스포츠를 좋아하는 사람들이 모여 정보와 경험을 나누는 곳, morethancar.
            </p>
            <div className={styles.ctaRow}>
              {session ? (
                <a className={styles.cta} href="/home">
                  내 차고로 가기 <span aria-hidden="true">→</span>
                </a>
              ) : (
                <a className={styles.cta} href="/signup">
                  지금 시작하기 <span aria-hidden="true">→</span>
                </a>
              )}
              <a className={styles.ctaGhost} href="/community">
                커뮤니티 둘러보기
              </a>
            </div>
            {stats && (
              <dl className={styles.stats}>
                <div>
                  <dt>커뮤니티 회원</dt>
                  <dd>{compactCount(stats.memberCount)}</dd>
                </div>
                <div>
                  <dt>등록된 차량</dt>
                  <dd>{compactCount(stats.vehicleCount)}</dd>
                </div>
                <div>
                  <dt>누적 게시글</dt>
                  <dd>{compactCount(stats.postCount)}</dd>
                </div>
              </dl>
            )}
          </section>

          <TimingBoard
            size={5}
            headingId="timing-board-title"
            initial={{...initialBoard, failed: initialBoardFailed}}
            now={renderedAt}
            moreHref="/community?sort=popular"
          />

          <LatestPosts posts={latestPosts} now={renderedAt} />
        </div>

        <ServiceShortcuts />

        <div className={styles.lowerGrid}>
          <GarageShowcase vehicles={garage} />
          <MotorsportPreview events={motorsportEvents} />
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
