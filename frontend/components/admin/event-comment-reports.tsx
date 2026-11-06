'use client';

import {useCallback, useRef, useState} from 'react';
import {fetchEventCommentReports} from '../../lib/admin-api';
import type {AdminEventCommentReport, ReportStatus} from '../../lib/admin-types';
import {adminDate, REPORT_STATUS_LABELS} from '../../lib/admin-format';
import AdminList, {type AdminListHandle} from './admin-list';
import ReportDialog from './report-dialog';
import styles from './admin.module.css';

const STATUS_FILTERS: Record<ReportStatus | '', string> = {
  '': '전체',
  pending: '검토 대기',
  resolved: '처리 완료',
  dismissed: '반려',
};

// 모터스포츠 일정 댓글 신고(board-service/src/motorsport-comments.js). 게시글 신고 목록과 같은 모양,
// 검토 때 댓글을 함께 관리자 삭제할 수 있다.
export default function EventCommentReports({onAccessDenied}: {onAccessDenied: () => void}) {
  const [status, setStatus] = useState<ReportStatus | ''>('');
  const [reviewTarget, setReviewTarget] = useState<AdminEventCommentReport | null>(null);
  const listRef = useRef<AdminListHandle>(null);

  const load = useCallback(
    (params: {q: string; page: number}) => fetchEventCommentReports({q: params.q, status, page: params.page}),
    [status],
  );

  return (
    <>
      <AdminList<AdminEventCommentReport>
        ref={listRef}
        searchLabel="일정 댓글 신고 검색"
        searchPlaceholder="일정 / 댓글 / 사용자 검색"
        extraFilters={
          <select aria-label="신고 상태 필터" value={status} onChange={(e) => setStatus(e.target.value as ReportStatus | '')}>
            {(Object.keys(STATUS_FILTERS) as (ReportStatus | '')[]).map((value) => (
              <option key={value} value={value}>
                {STATUS_FILTERS[value]}
              </option>
            ))}
          </select>
        }
        load={load}
        getRowKey={(item) => item.id}
        onAccessDenied={onAccessDenied}
        emptyText="조회 결과가 없습니다."
        columns={[
          {
            header: '대상 댓글',
            render: (item) => (
              <div>
                <a className={styles.textLink} href={`/motorsport/${item.eventId}`} target="_blank" rel="noopener">
                  {item.eventTitle}
                </a>
                <p>{item.author}</p>
                <p className={styles.detailText}>{item.content}</p>
              </div>
            ),
          },
          {header: '신고자', render: (item) => item.reporter},
          {header: '사유', render: (item) => item.reason},
          {
            header: '처리 기록',
            render: (item) => (
              <div>
                <span>{REPORT_STATUS_LABELS[item.status] || item.status}</span>
                {item.commentDeleted && (
                  <p>
                    {item.deletedReason === 'AUTHOR' ? '작성자가 삭제한 댓글' : `관리자가 삭제한 댓글${item.moderationNote ? ` · ${item.moderationNote}` : ''}`}
                  </p>
                )}
                {item.reviewedAt && (
                  <>
                    <p>
                      {item.reviewer || '삭제된 담당자'} · {adminDate(item.reviewedAt)}
                    </p>
                    <p>{item.resolutionNote}</p>
                  </>
                )}
              </div>
            ),
          },
          {
            header: '검토',
            render: (item) =>
              item.status === 'pending' ? (
                <button type="button" className={styles.secondary} onClick={() => setReviewTarget(item)}>
                  검토
                </button>
              ) : null,
          },
        ]}
      />
      {reviewTarget && (
        <ReportDialog
          reportId={reviewTarget.id}
          postTitle={`${reviewTarget.eventTitle} — ${reviewTarget.content}`}
          kind="eventComment"
          canDeleteComment={!reviewTarget.commentDeleted}
          onClose={() => setReviewTarget(null)}
          onReviewed={() => listRef.current?.reload()}
        />
      )}
    </>
  );
}
