'use client';

import {useCallback, useEffect, useState} from 'react';
import {ApiError, ENTITY_LABELS, fetchContentLogs, LOG_ACTION_LABELS, type ContentLog} from '../../lib/admin-motorsport';
import type {Page} from '../../lib/admin-types';
import {adminDate} from '../../lib/admin-format';
import styles from './admin.module.css';

// Fields worth showing in a change summary, with Korean labels (raw row keys
// from content_admin_logs.before/after).
const FIELD_LABELS: Record<string, string> = {
  title: '일정명',
  name: '이름',
  code: '코드',
  kind: '종류',
  status: '진행 상태',
  publication: '공개 상태',
  starts_on: '시작일',
  ends_on: '종료일',
  starts_at: '시작 시각',
  series_id: '시리즈',
  venue_id: '장소',
  source_url: '출처 URL',
  source_name: '출처 이름',
  verified_on: '확인일',
  note: '메모',
  scope: '구분',
  country: '국가',
  region: '지역',
  timezone: '시간대',
  official_url: '공식 사이트',
  active: '사용',
  deleted_at: '삭제',
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '없음';
  return String(value).replace(/T00:00:00(\+00:00|Z)?$/, '');
}

function changes(log: ContentLog): [string, string, string][] {
  if (!log.before || !log.after) return [];
  return Object.keys(FIELD_LABELS)
    .filter((k) => k in log.after! && JSON.stringify(log.before![k]) !== JSON.stringify(log.after![k]))
    .map((k) => [FIELD_LABELS[k], show(log.before![k]), show(log.after![k])]);
}

// 변경 이력 — content_admin_logs: who (account + role at the time), what
// (entity + id), which action, when, reason and the changed fields.
export default function MotorsportLogs({onAccessDenied}: {onAccessDenied: () => void}) {
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<ContentLog> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    fetchContentLogs({entityType, action, page})
      .then(setResult)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
        else setError(e instanceof Error ? e.message : '변경 이력을 불러오지 못했어요.');
      });
  }, [entityType, action, page, onAccessDenied]);
  useEffect(load, [load]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <section className={styles.panel} aria-labelledby="logs-title">
      <div className={styles.panelTop}>
        <h2 id="logs-title">변경 이력</h2>
      </div>
      <div className={styles.filters}>
        <select aria-label="대상" value={entityType} onChange={(e) => { setEntityType(e.target.value); setPage(1); }}>
          <option value="">전체 대상</option>
          {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select aria-label="작업" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">전체 작업</option>
          {Object.entries(LOG_ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <button type="button" className={styles.secondary} onClick={load}>새로고침</button>
      </div>
      {error ? (
        <p className={styles.errorText}>{error}</p>
      ) : (
        <>
          <p className={styles.count}>{result ? `총 ${result.total}건 · ${result.page} / ${pages} 페이지` : '불러오는 중…'}</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>시각</th>
                  <th>수행자</th>
                  <th>대상</th>
                  <th>작업</th>
                  <th>변경 내용 · 사유</th>
                </tr>
              </thead>
              <tbody>
                {!result ? (
                  <tr><td colSpan={5}>불러오는 중…</td></tr>
                ) : result.items.length === 0 ? (
                  <tr><td colSpan={5}>기록이 없어요.</td></tr>
                ) : (
                  result.items.map((log) => {
                    const target = (log.after ?? log.before) as Record<string, unknown> | null;
                    const diff = log.action === 'UPDATE' ? changes(log) : [];
                    return (
                      <tr key={log.id}>
                        <td>{adminDate(log.createdAt)}</td>
                        <td>
                          <span className={styles.rowTitle}>{log.actorUsername}</span>
                          <span className={`${styles.chip} ${log.actorRole === 'ADMIN' ? styles.chipDark : styles.chipNeutral}`}>{log.actorRole}</span>
                        </td>
                        <td>
                          <span className={styles.rowTitle}>{String(target?.title ?? target?.name ?? '')}</span>
                          <span className={styles.rowSub}>{ENTITY_LABELS[log.entityType]} #{log.entityId}</span>
                        </td>
                        <td>
                          <span className={`${styles.chip} ${log.action === 'DELETE' ? styles.chipBlocked : log.action === 'PUBLISH' ? styles.chipOk : styles.chipNeutral}`}>
                            {LOG_ACTION_LABELS[log.action] ?? log.action}
                          </span>
                        </td>
                        <td>
                          {diff.length > 0 && (
                            <ul className={styles.diff}>
                              {diff.map(([label, from, to]) => (
                                <li key={label}>{label}: <del>{from}</del> → <ins>{to}</ins></li>
                              ))}
                            </ul>
                          )}
                          {log.action === 'VERIFY' && <span className={styles.rowSub}>확인일 {show(log.after?.verified_on)}</span>}
                          {log.reason && <span className={styles.rowSub}>사유: {log.reason}</span>}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <nav className={styles.pager} aria-label="페이지">
            <button type="button" className={styles.secondary} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button>
            <button type="button" className={styles.secondary} disabled={!result || page >= pages} onClick={() => setPage((p) => p + 1)}>다음</button>
          </nav>
        </>
      )}
    </section>
  );
}
