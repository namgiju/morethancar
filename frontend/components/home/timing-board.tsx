'use client';

import {useEffect, useRef, useState} from 'react';
import type {BoardPeriod, Post} from '../../lib/home-types';
import {fetchTodayPosts} from '../../lib/home-api';
import {CATEGORY_LABELS, imageUrl, postUrl} from '../../lib/format';
import styles from './main.module.css';

const BOARD_SIZE = 5;
const DAY_MS = 86_400_000;

const CATEGORIES: {value: string; label: string}[] = [
  {value: '', label: '전체'},
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({value, label})),
];
const PERIODS: {value: BoardPeriod; label: string; caption: string}[] = [
  {value: 'today', label: '오늘', caption: '오늘 00시 이후'},
  {value: 'week', label: '7일', caption: '최근 7일'},
  {value: '', label: '전체', caption: '전체 기간'},
];

// TIMING BOARD: the real popular-post ranking (board-service sort=popular =
// likes, then comments), shown as race positions P1–P5. There is no ranking
// history in the API, so no up/down movement is shown; "NEW" only means the
// post itself was written in the last 24 hours (its real createdAt).
export default function TimingBoard({
  initialPosts,
  initialPeriod,
  initialFailed,
  now,
}: {
  initialPosts: Post[];
  initialPeriod: BoardPeriod;
  initialFailed: boolean;
  now: number;
}) {
  const [category, setCategory] = useState('');
  const [period, setPeriod] = useState<BoardPeriod>(initialPeriod);
  const [posts, setPosts] = useState(initialPosts);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(initialFailed);
  const ticket = useRef(0);
  const isFirst = useRef(true);

  useEffect(() => {
    // The first render uses the server's posts; only filter changes refetch.
    if (isFirst.current) {
      isFirst.current = false;
      return;
    }
    const current = ++ticket.current;
    setLoading(true);
    setFailed(false);
    fetchTodayPosts({category, period: period || undefined, limit: BOARD_SIZE})
      .then((data) => {
        if (current === ticket.current) setPosts(data);
      })
      .catch(() => {
        if (current === ticket.current) setFailed(true);
      })
      .finally(() => {
        if (current === ticket.current) setLoading(false);
      });
  }, [category, period]);

  const caption = PERIODS.find((p) => p.value === period)?.caption ?? '';
  const moreHref = `/community?sort=popular${category ? `&category=${encodeURIComponent(category)}` : ''}`;

  return (
    <section className={styles.board} aria-labelledby="timing-board-title">
      <div className={styles.boardHead}>
        <h2 id="timing-board-title" className={styles.boardTitle}>
          TIMING BOARD
          <span className={styles.boardCaption}>추천순 · {caption}</span>
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
      <div className={styles.chips} role="group" aria-label="게시판 선택">
        {CATEGORIES.map((c) => (
          <button
            key={c.value || 'all'}
            type="button"
            aria-pressed={category === c.value}
            onClick={() => setCategory(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div aria-live="polite" aria-busy={loading}>
        {failed ? (
          <p className={styles.emptyLine}>순위를 불러오지 못했어요. 새로고침해주세요.</p>
        ) : !posts.length ? (
          <p className={styles.emptyLine}>
            이 조건에 맞는 이야기가 아직 없어요. <a href="/community/new">첫 이야기 남기기 →</a>
          </p>
        ) : (
          <ol className={styles.boardList} data-loading={loading || undefined}>
            {posts.slice(0, BOARD_SIZE).map((post, i) => (
              <li key={post.id}>
                <a className={styles.boardRow} href={postUrl(post)} data-pos={i + 1}>
                  <span className={styles.position} aria-label={`${i + 1}위`}>
                    P{i + 1}
                  </span>
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitle}>{post.title}</span>
                    <span className={styles.rowMeta}>
                      <span className={styles.tag}>{CATEGORY_LABELS[post.category] || post.category}</span>
                      <span>{post.authorId == null ? post.username : `@${post.username}`}</span>
                      {post.vehicle && <span className={styles.vehicle}>{post.vehicle}</span>}
                      {now - new Date(post.createdAt).getTime() < DAY_MS && (
                        <span className={styles.newTag} title="24시간 이내 작성">
                          NEW
                        </span>
                      )}
                    </span>
                  </span>
                  <span className={styles.rowStats}>
                    <span>
                      추천 <b>{post.likeCount.toLocaleString('ko-KR')}</b>
                    </span>
                    <span>
                      댓글 <b>{post.commentCount.toLocaleString('ko-KR')}</b>
                    </span>
                  </span>
                  {post.imageIds?.length > 0 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.rowThumb} src={imageUrl(post.imageIds[0])} alt="" loading="lazy" />
                  ) : (
                    // Keeps the stats column aligned on rows without a photo.
                    <span className={styles.rowThumbEmpty} aria-hidden="true" />
                  )}
                </a>
              </li>
            ))}
          </ol>
        )}
      </div>
      <a className={styles.moreLink} href={moreHref}>
        인기글 전체 보기 →
      </a>
    </section>
  );
}
