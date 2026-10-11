import type {Post} from '../../lib/home-types';
import {CATEGORY_LABELS, postUrl, timeAgo} from '../../lib/format';
import styles from './main.module.css';

// "방금 올라온 글": the real newest posts (sort=latest). `now` is the server's
// render time so the relative times match between SSR and hydration.
export default function LatestPosts({posts, now}: {posts: Post[] | null; now: number}) {
  return (
    <section className={styles.latest} aria-labelledby="latest-title">
      <div className={styles.panelHead}>
        <h2 id="latest-title">방금 올라온 글</h2>
        <a href="/community">전체 보기 →</a>
      </div>
      {posts === null ? (
        <p className={styles.emptyLine}>최신글을 불러오지 못했어요. 새로고침해주세요.</p>
      ) : !posts.length ? (
        <p className={styles.emptyLine}>
          아직 올라온 글이 없어요. <a href="/community/new">첫 이야기 남기기 →</a>
        </p>
      ) : (
        <ol className={styles.latestList}>
          {posts.map((post) => (
            <li key={post.id}>
              <a href={postUrl(post)} className={styles.latestRow}>
                <time className={styles.latestTime} dateTime={post.createdAt}>
                  {timeAgo(post.createdAt, now)}
                </time>
                <span className={styles.latestBody}>
                  <span className={styles.latestTitle}>{post.title}</span>
                  <span className={styles.rowMeta}>
                    <span className={styles.tag}>{CATEGORY_LABELS[post.category] || post.category}</span>
                    <span>{post.authorId == null ? post.username : `@${post.username}`}</span>
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
