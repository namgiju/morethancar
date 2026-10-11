import type {CommunityPost} from '../../lib/community-types';
import {CATEGORY_LABELS, imageUrl, memberUrl, postUrl} from '../../lib/format';
import styles from './community.module.css';

// One row in the community post list (the general list keeps the page's
// sort — no race positions here; those are the TIMING BOARD's). Title,
// category, author (→ their public garage), date, 조회/추천/댓글, and a small
// thumbnail only when the post has a photo.
//
// Deliberately a <div>, not <article>: app/globals.css has an unscoped
// `article{background:#14161b;border-radius:20px;...}` rule (dark card style
// for the old garage prototype) that would otherwise paint every row's
// background near-black under this page's light theme.
export default function PostRow({post}: {post: CommunityPost}) {
  const href = postUrl(post);
  return (
    <div className={styles.feedRow}>
      <div className={styles.feedMain}>
        <a className={styles.feedTitle} href={href}>
          {post.title}
        </a>
        <div className={styles.feedMeta}>
          <span className={styles.feedCategory}>{CATEGORY_LABELS[post.category] || post.category}</span>
          {post.authorId == null ? (
            <span className={styles.feedAuthorWithdrawn}>탈퇴한 회원</span>
          ) : (
            <a className={styles.feedAuthor} href={memberUrl(post.authorId)}>
              @{post.username}
            </a>
          )}
          <time dateTime={post.createdAt}>
            {new Date(post.createdAt).toLocaleDateString('ko-KR', {timeZone: 'Asia/Seoul'})}
          </time>
        </div>
      </div>
      <div className={styles.feedStats}>
        <span aria-label={`조회 ${post.views}`}>
          조회 <b>{post.views.toLocaleString('ko-KR')}</b>
        </span>
        <span aria-label={`추천 ${post.likeCount}`}>
          추천 <b>{post.likeCount.toLocaleString('ko-KR')}</b>
        </span>
        <span aria-label={`댓글 ${post.commentCount}`}>
          댓글 <b>{post.commentCount.toLocaleString('ko-KR')}</b>
        </span>
      </div>
      {post.imageIds.length > 0 ? (
        <a className={styles.feedThumbLink} href={href} tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(post.imageIds[0])} alt="" loading="lazy" className={styles.feedThumb} />
        </a>
      ) : (
        <span className={styles.feedThumbEmpty} aria-hidden="true" />
      )}
    </div>
  );
}
