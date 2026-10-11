'use client';

import {useEffect, useRef, useState} from 'react';
import type {BoardPeriod, Post} from '../../lib/home-types';
import {fetchTodayPosts} from '../../lib/home-api';
import {CATEGORY_LABELS, imageUrl, postUrl} from '../../lib/format';
import styles from './timing-board.module.css';

const DAY_MS = 86_400_000;
const AUTO_PERIODS: BoardPeriod[] = ['today', 'week', ''];

const CATEGORIES: {value: string; label: string}[] = [
  {value: '', label: '전체'},
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({value, label})),
];
const PERIODS: {value: BoardPeriod; label: string; caption: string}[] = [
  {value: 'today', label: '오늘', caption: '오늘 00시 이후'},
  {value: 'week', label: '7일', caption: '최근 7일'},
  {value: '', label: '전체', caption: '전체 기간'},
];

type Props = {
  size: number;
  headingId: string;
  title?: string;
  // Server-rendered first ranking (main page). Without it the board loads in
  // the browser (community list).
  initial?: {posts: Post[]; period: BoardPeriod; failed: boolean};
  // Controlled board category (community left nav). When given, the board
  // hides its own category chips.
  category?: string;
  // Server render time for the "NEW" tag, so SSR and hydration agree.
  now?: number;
  moreHref?: string;
};

// TIMING BOARD: the real popular-post ranking (board-service sort=popular =
// likes, then comments) shown as race positions. There is no ranking history
// in the API, so no up/down movement is shown; "NEW" only means the post was
// written in the last 24 hours (its real createdAt). On first load and on a
// category change the period widens today → 7일 → 전체 until something is
// found; the period tabs always show the period actually used.
export default function TimingBoard({size, headingId, title = 'TIMING BOARD', initial, category, now, moreHref}: Props) {
  const [ownCategory, setOwnCategory] = useState('');
  const boardCategory = category ?? ownCategory;
  const [period, setPeriod] = useState<BoardPeriod>(initial?.period ?? 'today');
  const [posts, setPosts] = useState<Post[]>(initial?.posts ?? []);
  const [loading, setLoading] = useState(!initial);
  const [failed, setFailed] = useState(initial?.failed ?? false);
  const [renderNow] = useState(() => now ?? Date.now());
  const ticket = useRef(0);
  // Skip the effect run that only reflects the server data or a period the
  // auto-widening itself just set.
  const skip = useRef(!!initial);
  const auto = useRef(!initial);
  const lastCategory = useRef(boardCategory);

  useEffect(() => {
    if (lastCategory.current !== boardCategory) {
      lastCategory.current = boardCategory;
      auto.current = true;
    }
    if (skip.current) {
      skip.current = false;
      return;
    }
    const current = ++ticket.current;
    const widen = auto.current;
    auto.current = false;
    setLoading(true);
    setFailed(false);
    const load = (p: BoardPeriod) => fetchTodayPosts({category: boardCategory, period: p || undefined, limit: size});
    (async () => {
      try {
        if (!widen) {
          const data = await load(period);
          if (current === ticket.current) setPosts(data);
          return;
        }
        for (const p of AUTO_PERIODS) {
          const data = await load(p);
          if (current !== ticket.current) return;
          if (data.length || p === '') {
            setPosts(data);
            if (p !== period) {
              skip.current = true;
              setPeriod(p);
            }
            return;
          }
        }
      } catch {
        if (current === ticket.current) setFailed(true);
      } finally {
        if (current === ticket.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardCategory, period]);

  const caption = PERIODS.find((p) => p.value === period)?.caption ?? '';

  return (
    <section className={styles.board} aria-labelledby={headingId}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>
          {title}
          <span className={styles.caption}>추천순 · {caption}</span>
        </h2>
        <div className={styles.segment} role="group" aria-label="기간 선택">
          {PERIODS.map((p) => (
            <button
              key={p.value || 'all'}
              type="button"
              aria-pressed={period === p.value}
              onClick={() => setPeriod(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
      {category === undefined && (
        <div className={styles.chips} role="group" aria-label="게시판 선택">
          {CATEGORIES.map((c) => (
            <button
              key={c.value || 'all'}
              type="button"
              aria-pressed={ownCategory === c.value}
              onClick={() => setOwnCategory(c.value)}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div aria-live="polite" aria-busy={loading}>
        {failed ? (
          <p className={styles.empty}>순위를 불러오지 못했어요. 새로고침해주세요.</p>
        ) : !posts.length ? (
          <p className={styles.empty}>
            {loading ? (
              '순위를 불러오고 있어요.'
            ) : (
              <>
                이 조건에 맞는 이야기가 아직 없어요. <a href="/community/new">첫 이야기 남기기 →</a>
              </>
            )}
          </p>
        ) : (
          <ol className={styles.list} data-loading={loading || undefined}>
            {posts.slice(0, size).map((post, i) => (
              <li key={post.id}>
                <a className={styles.row} href={postUrl(post)} data-pos={i + 1}>
                  <span className={styles.position} aria-label={`${i + 1}위`}>
                    P{i + 1}
                  </span>
                  <span className={styles.main}>
                    <span className={styles.rowTitle}>{post.title}</span>
                    <span className={styles.meta}>
                      <span className={styles.tag}>{CATEGORY_LABELS[post.category] || post.category}</span>
                      <span>{post.authorId == null ? post.username : `@${post.username}`}</span>
                      {post.vehicle && <span className={styles.vehicle}>{post.vehicle}</span>}
                      {renderNow - new Date(post.createdAt).getTime() < DAY_MS && (
                        <span className={styles.newTag} title="24시간 이내 작성">
                          NEW
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={styles.stats}>
                    <span>
                      추천 <b>{post.likeCount.toLocaleString('ko-KR')}</b>
                    </span>
                    <span>
                      댓글 <b>{post.commentCount.toLocaleString('ko-KR')}</b>
                    </span>
                  </span>
                  {post.imageIds?.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.thumb} src={imageUrl(post.imageIds[0])} alt="" loading="lazy" />
                  ) : (
                    // Keeps the stats column aligned on rows without a photo.
                    <span className={styles.thumbEmpty} aria-hidden="true" />
                  )}
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
      {moreHref && (
        <a
          className={styles.more}
          href={`${moreHref}${boardCategory ? `${moreHref.includes('?') ? '&' : '?'}category=${encodeURIComponent(boardCategory)}` : ''}`}
        >
          인기글 전체 보기 →
        </a>
      )}
    </section>
  );
}
