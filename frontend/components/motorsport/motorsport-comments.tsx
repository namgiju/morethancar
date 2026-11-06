'use client';

import {useCallback, useEffect, useRef, useState, type FormEvent} from 'react';
import {usePathname} from 'next/navigation';
import {fetchSession} from '../../lib/home-api';
import type {SessionUser} from '../../lib/home-types';
import {
  ApiError,
  COMMENT_MAX,
  createEventComment,
  deleteEventComment,
  fetchEventComments,
  reportEventComment,
  type EventComment,
} from '../../lib/motorsport-comments-api';
import {formatDateTime, memberUrl} from '../../lib/format';
import styles from './motorsport.module.css';

// 진행 중인 한 가지 동작(댓글 하나에 대해). 브라우저 대화상자(confirm/prompt) 대신 댓글 아래에 펼친다.
type Action = {type: 'delete' | 'adminDelete' | 'report'; id: number} | null;

// 일정 상세 오른쪽 댓글 — 게시판 댓글(components/community/comment-section.tsx)과 같은 규칙:
// 답글은 1단계(최상위 댓글에만), 삭제는 작성자 또는 ADMIN(사유 필수), 신고는 다른 회원의 댓글만.
// 맨 article·section 요소는 쓰지 않는다(app/globals.css의 옛 다크 테마 전역 규칙).
export default function MotorsportComments({eventId}: {eventId: number}) {
  const pathname = usePathname();
  const [viewer, setViewer] = useState<SessionUser | null | undefined>(undefined);
  const [comments, setComments] = useState<EventComment[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [content, setContent] = useState('');
  const [replyTo, setReplyTo] = useState<EventComment | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [actionText, setActionText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const submittingRef = useRef(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let active = true;
    fetchSession()
      .then((user) => active && setViewer(user))
      .catch(() => active && setViewer(null));
    return () => {
      active = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const rows = await fetchEventComments(eventId);
      setComments(rows);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  function startReply(comment: EventComment) {
    setReplyTo(comment);
    setFormError('');
    inputRef.current?.focus();
  }

  function openAction(next: Action) {
    setAction(next);
    setActionText('');
    setActionError('');
  }

  // ref로 Enter + 클릭 같은 연속 제출을 막는다(상태는 다음 렌더 전까지 반영되지 않는다).
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || !viewer) return;
    const trimmed = content.trim();
    if (!trimmed) {
      setFormError('댓글 내용을 입력해 주세요.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setFormError('');
    try {
      await createEventComment(eventId, trimmed, replyTo?.id ?? null);
      setContent('');
      setReplyTo(null);
      setNotice(replyTo ? '답글을 남겼어요.' : '댓글을 남겼어요.');
      await load();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : '댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  async function runAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || actionBusy) return;
    const reason = actionText.trim();
    if (action.type !== 'delete' && !reason) {
      setActionError(action.type === 'report' ? '신고 사유를 입력해 주세요.' : '삭제 사유를 입력해 주세요.');
      return;
    }
    setActionBusy(true);
    setActionError('');
    try {
      if (action.type === 'report') {
        await reportEventComment(action.id, reason);
        setNotice('신고를 접수했어요. 운영자가 확인할게요.');
      } else {
        await deleteEventComment(action.id, action.type === 'adminDelete' ? reason : undefined);
        setNotice('댓글을 삭제했어요.');
        if (replyTo?.id === action.id) setReplyTo(null);
        await load();
      }
      setAction(null);
    } catch (e) {
      setActionError(e instanceof ApiError ? e.message : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setActionBusy(false);
    }
  }

  const list = comments ?? [];
  const visibleCount = list.filter((c) => !c.deleted).length;
  const topLevel = list.filter((c) => !c.parentId);
  const isAdmin = viewer?.role === 'ADMIN';

  function actionForm(c: EventComment) {
    if (action?.id !== c.id) return null;
    const label = action.type === 'report' ? '신고 사유' : '삭제 사유';
    return (
      <form className={styles.commentActionForm} onSubmit={runAction}>
        {action.type === 'delete' ? (
          <p className={styles.commentActionText}>이 댓글을 삭제할까요?</p>
        ) : (
          <textarea
            aria-label={label}
            placeholder={action.type === 'report' ? '어떤 점이 문제인지 알려 주세요.' : '삭제 사유를 남겨 주세요. (작성자에게는 보이지 않아요)'}
            maxLength={500}
            rows={2}
            value={actionText}
            onChange={(e) => setActionText(e.target.value)}
            readOnly={actionBusy}
            autoFocus
          />
        )}
        {actionError && (
          <p className={styles.commentError} role="alert">
            {actionError}
          </p>
        )}
        <div className={styles.commentActionButtons}>
          <button type="button" className={styles.commentTextButton} onClick={() => setAction(null)} disabled={actionBusy}>
            취소
          </button>
          <button type="submit" className={styles.commentDangerButton} disabled={actionBusy} autoFocus={action.type === 'delete'}>
            {actionBusy ? '처리 중…' : action.type === 'report' ? '신고하기' : '삭제'}
          </button>
        </div>
      </form>
    );
  }

  function commentNode(c: EventComment) {
    const mine = viewer != null && c.authorId === viewer.id;
    return (
      <li key={c.id} className={styles.commentItem} data-reply={c.parentId ? '' : undefined} data-deleted={c.deleted || undefined}>
        <div className={styles.commentMeta}>
          {c.authorId == null ? (
            <span className={styles.commentAuthorMuted}>{c.username}</span>
          ) : (
            <a className={styles.commentAuthor} href={memberUrl(c.authorId)}>
              {c.username}
            </a>
          )}
          <time dateTime={c.createdAt}>{formatDateTime(c.createdAt)}</time>
        </div>
        <p className={styles.commentBody}>{c.content}</p>
        {!c.deleted && viewer && (
          <div className={styles.commentActions}>
            {!c.parentId && (
              <button type="button" className={styles.commentTextButton} onClick={() => startReply(c)}>
                답글
              </button>
            )}
            {mine && (
              <button type="button" className={styles.commentTextButton} onClick={() => openAction({type: 'delete', id: c.id})}>
                삭제
              </button>
            )}
            {!mine && isAdmin && (
              <button type="button" className={styles.commentTextButton} onClick={() => openAction({type: 'adminDelete', id: c.id})}>
                관리자 삭제
              </button>
            )}
            {!mine && (
              <button type="button" className={styles.commentTextButton} onClick={() => openAction({type: 'report', id: c.id})}>
                신고
              </button>
            )}
          </div>
        )}
        {actionForm(c)}
      </li>
    );
  }

  return (
    <div className={styles.commentPanel} role="region" aria-labelledby="event-comments-title">
      <div className={styles.panelHead}>
        <h2 id="event-comments-title">댓글</h2>
        {comments && <span className={styles.panelCaption}>{visibleCount}개</span>}
      </div>

      {viewer === undefined ? null : viewer ? (
        <form className={styles.commentForm} onSubmit={submit}>
          {replyTo && (
            <div className={styles.replyLabel}>
              <span>{replyTo.username} 님에게 답글</span>
              <button type="button" className={styles.commentTextButton} onClick={() => setReplyTo(null)}>
                취소
              </button>
            </div>
          )}
          <textarea
            ref={inputRef}
            aria-label={replyTo ? '답글 내용' : '댓글 내용'}
            placeholder="이 경기에 대한 응원이나 생각을 남겨 주세요."
            maxLength={COMMENT_MAX}
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={submitting}
          />
          {formError && (
            <p className={styles.commentError} role="alert">
              {formError}
            </p>
          )}
          <div className={styles.commentFormFoot}>
            <span className={styles.commentCount}>
              {content.length}/{COMMENT_MAX}
            </span>
            <button type="submit" className={styles.commentSubmit} disabled={submitting}>
              {submitting ? '등록 중…' : replyTo ? '답글 등록' : '댓글 등록'}
            </button>
          </div>
        </form>
      ) : (
        <p className={styles.commentLogin}>
          <a href={`/login?next=${encodeURIComponent(pathname)}`}>로그인</a>하고 댓글을 남겨 보세요.
        </p>
      )}

      <p className={styles.srOnly} aria-live="polite">
        {notice}
      </p>

      {loadFailed ? (
        <p className={styles.empty}>댓글을 불러오지 못했어요. 새로고침해 주세요.</p>
      ) : comments === null ? (
        <p className={styles.empty}>불러오는 중이에요.</p>
      ) : topLevel.length ? (
        <ol className={styles.commentList}>
          {topLevel.flatMap((c) => [c, ...list.filter((r) => r.parentId === c.id)]).map(commentNode)}
        </ol>
      ) : (
        <p className={styles.empty}>아직 댓글이 없어요. 첫 댓글을 남겨 보세요.</p>
      )}
    </div>
  );
}
