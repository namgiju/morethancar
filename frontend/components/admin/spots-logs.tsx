'use client';

import {useCallback, useEffect, useState} from 'react';
import {ApiError, fetchContentLogs, LOG_ACTION_LABELS, type ContentLog} from '../../lib/admin-spots';
import type {Page} from '../../lib/admin-types';
import {adminDate} from '../../lib/admin-format';
import styles from './admin.module.css';

// 기록 비교에 쓰는 필드 이름 — content_admin_logs.before/after(snake_case).
const FIELD_LABELS: Record<string, string> = {
  name: '이름',
  category: '카테고리',
  region: '지역',
  address: '주소',
  latitude: '위도',
  longitude: '경도',
  publication: '공개 상태',
  description: '설명',
  image_url: '대표 이미지',
  route_start: '코스 시작',
  route_end: '코스 종료',
  distance_km: '거리',
  duration_minutes: '예상 시간',
  business_hours: '운영시간',
  official_url: '공식 홈페이지',
  reservation_url: '예약 링크',
  deleted_at: '삭제',
};

function show(value: unknown): string {
  if (value === null || value === undefined || value === '') return '없음';
  return String(value);
}

function changes(log: ContentLog): [string, string, string][] {
  if (!log.before || !log.after) return [];
  return Object.keys(FIELD_LABELS)
    .filter((k) => k in log.after! && JSON.stringify(log.before![k]) !== JSON.stringify(log.after![k]))
    .map((k) => [FIELD_LABELS[k], show(log.before![k]), show(log.after![k])]);
}

// 변경 이력 — content_admin_logs(entity_type='SPOT'): 누가(당시 역할), 무엇을, 언제, 사유, 바뀐 필드.
export default function SpotsLogs({onAccessDenied}: {onAccessDenied: () => void}) {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<ContentLog> | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    fetchContentLogs({action, page})
      .then(setResult)
      .catch((e) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
        else setError(e instanceof Error ? e.message : '변경 이력을 불러오지 못했어요.');
      });
  }, [action, page, onAccessDenied]);
  useEffect(load, [load]);

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <section className={styles.panel} aria-labelledby="spot-logs-title">
      <div className={styles.panelTop}>
        <h2 id="spot-logs-title">변경 이력</h2>
      </div>
      <div className={styles.filters}>
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
                          <span className={styles.rowTitle}>{String(target?.name ?? '')}</span>
                          <span className={styles.rowSub}>스팟 #{log.entityId}</span>
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
