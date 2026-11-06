'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {reviewEventCommentReport, reviewReport} from '../../lib/admin-api';
import styles from './admin.module.css';

// 신고 검토 다이얼로그 — assignment-frontend/js/admin.js의 #review-dialog 포팅.
// 게시글 신고는 처리 결과를 기록할 뿐, 회원 정지나 게시글 숨김은 적용되지 않는다(legacy와 동일).
// 일정 댓글 신고(kind='eventComment')는 "처리 완료"와 함께 댓글을 관리자 삭제할 수 있다(검토 메모가 삭제 사유).
export default function ReportDialog({
  reportId,
  postTitle,
  kind = 'post',
  canDeleteComment = false,
  onClose,
  onReviewed,
}: {
  reportId: number;
  postTitle: string;
  kind?: 'post' | 'eventComment';
  // 댓글이 아직 삭제되지 않았을 때만 삭제 선택지를 보인다.
  canDeleteComment?: boolean;
  onClose: () => void;
  onReviewed: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [status, setStatus] = useState<'resolved' | 'dismissed'>('resolved');
  const [note, setNote] = useState('');
  const [deleteComment, setDeleteComment] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const trimmed = note.trim();
    if (!trimmed) {
      setError('검토 메모를 입력해주세요.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (kind === 'eventComment')
        await reviewEventCommentReport(reportId, {status, note: trimmed, deleteComment: status === 'resolved' && deleteComment});
      else await reviewReport(reportId, {status, note: trimmed});
      onReviewed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="review-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="review-dialog-title">신고 검토</h2>
      <p>{postTitle}</p>
      <p>
        {kind === 'eventComment'
          ? '검토 결과를 기록합니다. 댓글 삭제를 고르면 공개 화면에서 "관리자에 의해 삭제된 댓글"로 바뀝니다.'
          : '검토 결과를 기록합니다. 회원 정지나 게시글 숨김은 적용되지 않습니다.'}
      </p>
      <form onSubmit={submit}>
        <label>
          처리 결과
          <select value={status} onChange={(e) => setStatus(e.target.value as 'resolved' | 'dismissed')} disabled={busy}>
            <option value="resolved">처리 완료</option>
            <option value="dismissed">반려</option>
          </select>
        </label>
        {kind === 'eventComment' && canDeleteComment && status === 'resolved' && (
          <label>
            <input type="checkbox" checked={deleteComment} onChange={(e) => setDeleteComment(e.target.checked)} disabled={busy} />
            댓글도 삭제(관리자 삭제, 검토 메모가 삭제 사유로 남음)
          </label>
        )}
        <label>
          검토 메모
          <textarea maxLength={500} rows={4} required value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
        </label>
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? '저장 중…' : '저장'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
