'use client';

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {
  ApiError,
  deleteSpot,
  fetchAdminSpots,
  CATEGORY_LABELS,
  PUBLICATION_LABELS,
  REGIONS,
  restoreSpot,
  setPublication,
  type AdminSpot,
  type Publication,
  type SpotCategory,
} from '../../lib/admin-spots';
import type {Page} from '../../lib/admin-types';
import AdminShell, {AdminHeading, hasRole} from './admin-shell';
import AdminConfirmDialog, {type ConfirmSpec} from './admin-confirm-dialog';
import SpotDialog from './spot-dialog';
import SpotsLogs from './spots-logs';
import styles from './admin.module.css';

const TABS = [
  {key: 'spots', label: '스팟'},
  {key: 'logs', label: '변경 이력'},
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

// /admin/spots — MANAGER와 ADMIN이 와인딩·심레이싱 스팟을 관리한다. motorsport-admin.tsx와
// 같은 패턴이지만 스팟에는 시리즈/장소 카탈로그·재확인 대기열이 없어 탭이 더 적다.
export default function SpotsAdmin({kakaoMapKey}: {kakaoMapKey: string}) {
  return (
    <AdminShell active="spots" require="MANAGER">
      {({session, onAccessDenied}) => (
        <SpotsWorkspace isAdmin={hasRole(session, 'ADMIN')} onAccessDenied={onAccessDenied} kakaoMapKey={kakaoMapKey} />
      )}
    </AdminShell>
  );
}

function SpotsWorkspace({
  isAdmin,
  onAccessDenied,
  kakaoMapKey,
}: {
  isAdmin: boolean;
  onAccessDenied: () => void;
  kakaoMapKey: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isTab(tabParam) ? tabParam : 'spots';

  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AdminSpot | 'new' | null>(searchParams.get('new') === '1' ? 'new' : null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
      else setNotice(e instanceof Error ? e.message : '요청을 처리하지 못했어요.');
    },
    [onAccessDenied],
  );

  function changed(message: string) {
    setNotice(message);
    setReloadKey((k) => k + 1);
  }

  function setTab(next: TabKey) {
    const params = new URLSearchParams(searchParams);
    params.delete('new');
    if (next === 'spots') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
  }

  const actions = {
    edit: (spot: AdminSpot) => setEditing(spot),
    publish: (spot: AdminSpot) =>
      setConfirm({
        title: '스팟 공개',
        message: <><strong>{spot.name}</strong> 스팟을 공개 화면에 보이게 합니다.</>,
        confirmLabel: '공개',
        onConfirm: () => setPublication(spot.id, 'publish'),
      }),
    hide: (spot: AdminSpot) =>
      setConfirm({
        title: '스팟 비공개',
        message: <><strong>{spot.name}</strong> 스팟을 공개 화면에서 숨깁니다. 언제든 다시 공개할 수 있어요.</>,
        confirmLabel: '비공개로 전환',
        reason: 'optional',
        onConfirm: (reason) => setPublication(spot.id, 'hide', reason),
      }),
    remove: (spot: AdminSpot) =>
      setConfirm({
        title: '스팟 삭제 (ADMIN)',
        message: <><strong>{spot.name}</strong> 스팟을 삭제합니다. 공개 화면에서 사라지지만 기록은 남고 복원할 수 있어요.</>,
        confirmLabel: '삭제',
        danger: true,
        reason: 'optional',
        onConfirm: (reason) => deleteSpot(spot.id, reason),
      }),
    restore: (spot: AdminSpot) =>
      setConfirm({
        title: '스팟 복원 (ADMIN)',
        message: <><strong>{spot.name}</strong> 스팟을 복원합니다. 공개 상태는 삭제 전 그대로입니다.</>,
        confirmLabel: '복원',
        reason: 'optional',
        onConfirm: (reason) => restoreSpot(spot.id, reason),
      }),
  };

  return (
    <>
      <AdminHeading
        eyebrow="CONTENT"
        title="스팟 (와인딩·심레이싱)"
        description="좌표와 주소가 정확한 곳만 등록해주세요. 와인딩 코스는 공공도로 안전 안내가 함께 표시됩니다."
        actions={
          <button type="button" className={styles.primary} onClick={() => setEditing('new')}>
            ＋ 스팟 등록
          </button>
        }
      />
      <nav className={styles.subTabs} aria-label="스팟 관리">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={tab === t.key ? styles.tabActive : styles.tabButton}
            aria-current={tab === t.key ? 'page' : undefined}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>
      {tab === 'spots' && <SpotList isAdmin={isAdmin} reloadKey={reloadKey} actions={actions} onError={handleError} />}
      {tab === 'logs' && <SpotsLogs key={reloadKey} onAccessDenied={onAccessDenied} />}

      {editing && (
        <SpotDialog
          spot={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={changed}
          kakaoMapKey={kakaoMapKey}
        />
      )}
      {confirm && <AdminConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => changed('처리했어요.')} />}
    </>
  );
}

type Actions = Record<'edit' | 'publish' | 'hide' | 'remove' | 'restore', (spot: AdminSpot) => void>;

function SpotList({isAdmin, reloadKey, actions, onError}: {isAdmin: boolean; reloadKey: number; actions: Actions; onError: (e: unknown) => void}) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<SpotCategory | ''>('');
  const [region, setRegion] = useState('');
  const [publication, setPublicationFilter] = useState<Publication | ''>('');
  const [deleted, setDeleted] = useState<'exclude' | 'include' | 'only'>('exclude');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<AdminSpot> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminSpots({q, category, region, publication, deleted, page})
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && onError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category, region, publication, deleted, page, reloadKey, onError]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <section className={styles.panel} aria-labelledby="spot-list-title">
      <h2 id="spot-list-title" className={styles.srOnly}>스팟 목록</h2>
      <form className={styles.filters} role="search" onSubmit={submit}>
        <input aria-label="이름·주소 검색" placeholder="이름·주소 검색" maxLength={100} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select aria-label="카테고리" value={category} onChange={(e) => { setCategory(e.target.value as SpotCategory | ''); setPage(1); }}>
          <option value="">전체 카테고리</option>
          {(Object.keys(CATEGORY_LABELS) as SpotCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <select aria-label="지역" value={region} onChange={(e) => { setRegion(e.target.value); setPage(1); }}>
          <option value="">전체 지역</option>
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select aria-label="공개 상태" value={publication} onChange={(e) => { setPublicationFilter(e.target.value as Publication | ''); setPage(1); }}>
          <option value="">전체 공개 상태</option>
          {(Object.keys(PUBLICATION_LABELS) as Publication[]).map((p) => <option key={p} value={p}>{PUBLICATION_LABELS[p]}</option>)}
        </select>
        {isAdmin && (
          <select aria-label="삭제 여부" value={deleted} onChange={(e) => { setDeleted(e.target.value as typeof deleted); setPage(1); }}>
            <option value="exclude">삭제 제외</option>
            <option value="include">삭제 포함</option>
            <option value="only">삭제된 스팟만</option>
          </select>
        )}
        <button type="submit" className={styles.secondary}>검색</button>
      </form>
      <p className={styles.count} aria-live="polite">
        {result ? `총 ${result.total}개 · ${result.page} / ${pages} 페이지` : loading ? '불러오는 중…' : ''}
      </p>
      <SpotTable spots={result?.items ?? null} loading={loading} isAdmin={isAdmin} actions={actions} empty="조건에 맞는 스팟이 없어요." />
      <nav className={styles.pager} aria-label="페이지">
        <button type="button" className={styles.secondary} disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button>
        <button type="button" className={styles.secondary} disabled={loading || page >= pages} onClick={() => setPage((p) => p + 1)}>다음</button>
      </nav>
    </section>
  );
}

function SpotTable({spots, loading, isAdmin, actions, empty}: {spots: AdminSpot[] | null; loading: boolean; isAdmin: boolean; actions: Actions; empty: string}) {
  return (
    <div className={styles.tableWrap} aria-busy={loading}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>스팟</th>
            <th>카테고리</th>
            <th>지역·주소</th>
            <th>상태</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {!spots || loading ? (
            <tr><td colSpan={5}>불러오는 중…</td></tr>
          ) : spots.length === 0 ? (
            <tr><td colSpan={5}>{empty}</td></tr>
          ) : (
            spots.map((spot) => {
              const deleted = !!spot.deletedAt;
              return (
                <tr key={spot.id} className={deleted ? styles.rowDeleted : undefined}>
                  <td>
                    <span className={styles.rowTitle}>{spot.name}</span>
                    <span className={styles.rowSub}>#{spot.id}{spot.linkedPostCount ? ` · 후기 ${spot.linkedPostCount}` : ''}</span>
                  </td>
                  <td>{CATEGORY_LABELS[spot.category]}</td>
                  <td>
                    {spot.region ?? '-'}
                    <span className={styles.rowSub}>{spot.address}</span>
                  </td>
                  <td>
                    {deleted ? (
                      <span className={`${styles.chip} ${styles.chipBlocked}`}>삭제됨</span>
                    ) : (
                      <span className={`${styles.chip} ${spot.publication === 'PUBLISHED' ? styles.chipOk : spot.publication === 'HIDDEN' ? styles.chipDark : styles.chipNeutral}`}>
                        {PUBLICATION_LABELS[spot.publication]}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {!deleted && (
                        <>
                          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.edit(spot)}>수정</button>
                          {spot.publication === 'PUBLISHED' ? (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.hide(spot)}>비공개</button>
                          ) : (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.publish(spot)}>공개</button>
                          )}
                        </>
                      )}
                      {isAdmin && !deleted && (
                        <button type="button" className={`${styles.dangerButton} ${styles.small}`} onClick={() => actions.remove(spot)}>삭제</button>
                      )}
                      {isAdmin && deleted && (
                        <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.restore(spot)}>복원</button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
