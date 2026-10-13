'use client';

import {useCallback, useEffect, useState, type FormEvent, type ReactNode} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {
  ApiError,
  CATEGORY_LABELS,
  PUBLICATION_LABELS,
  REVISION_KIND_LABELS,
  STATUS_LABELS,
  VERIFICATION_LABELS,
  cancelVersion,
  deletePolicy,
  fetchAdminPolicies,
  fetchAdminPolicy,
  fetchAdminVersions,
  fetchStaleVersions,
  promoteVersion,
  restorePolicy,
  setPolicyPublication,
  setVersionPublication,
  verifyConfirmVersion,
  verifyVersion,
  type AdminPolicy,
  type AdminVersion,
  type EvCategory,
  type StaleVersion,
} from '../../lib/admin-ev';
import type {Page} from '../../lib/admin-types';
import AdminShell, {AdminHeading, hasRole} from './admin-shell';
import AdminConfirmDialog, {type ConfirmSpec} from './admin-confirm-dialog';
import EvPolicyDialog from './ev-policy-dialog';
import EvVersionDialog from './ev-version-dialog';
import EvLogs from './ev-logs';
import styles from './admin.module.css';

const TABS = [
  {key: 'policies', label: '정책'},
  {key: 'stale', label: '재확인 대기열'},
  {key: 'logs', label: '변경 이력'},
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

// /admin/ev — MANAGER와 ADMIN이 전기차 정책을 관리한다. 정책 항목(기본 정보)과 버전(내용·상태·
// 검증·공개)을 분리해 편집한다(§5·§6) — spots-admin.tsx/motorsport-admin.tsx와 같은 틀을 쓰되,
// "정책 → 버전 목록" 2단 구조가 추가됐다(?policy=로 전환, 탭과 별도).
export default function EvAdmin() {
  return (
    <AdminShell active="ev" require="MANAGER">
      {({session, onAccessDenied}) => <EvWorkspace isAdmin={hasRole(session, 'ADMIN')} onAccessDenied={onAccessDenied} />}
    </AdminShell>
  );
}

type PolicyActions = Record<'edit' | 'publish' | 'hide' | 'remove' | 'restore', (policy: AdminPolicy) => void>;
type VersionActions = Record<'edit' | 'publish' | 'hide' | 'verify' | 'verifyConfirm' | 'promote' | 'cancel', (version: AdminVersion) => void>;

function EvWorkspace({isAdmin, onAccessDenied}: {isAdmin: boolean; onAccessDenied: () => void}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isTab(tabParam) ? tabParam : 'policies';
  const policyIdParam = searchParams.get('policy');
  const selectedPolicyId = policyIdParam && /^\d+$/.test(policyIdParam) ? Number(policyIdParam) : null;

  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editingPolicy, setEditingPolicy] = useState<AdminPolicy | 'new' | null>(searchParams.get('new') === '1' ? 'new' : null);
  const [editingVersion, setEditingVersion] = useState<{policyId: number; version: AdminVersion | null; versions: AdminVersion[]} | null>(null);
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
    params.delete('policy');
    if (next === 'policies') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
  }
  function openPolicy(id: number) {
    const params = new URLSearchParams(searchParams);
    params.delete('tab');
    params.delete('new');
    params.set('policy', String(id));
    router.push(`${pathname}?${params}`, {scroll: false});
  }
  function closePolicy() {
    const params = new URLSearchParams(searchParams);
    params.delete('policy');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
  }

  const policyActions: PolicyActions = {
    edit: (policy) => setEditingPolicy(policy),
    publish: (policy) =>
      setConfirm({
        title: '정책 공개',
        message: <><strong>{policy.title}</strong> 정책을 공개 화면에 노출합니다. 대표 버전이 공개돼 있어야 실제로 보여요.</>,
        confirmLabel: '공개',
        onConfirm: () => setPolicyPublication(policy.id, 'publish'),
      }),
    hide: (policy) =>
      setConfirm({
        title: '정책 전체 비공개',
        message: <><strong>{policy.title}</strong> 정책 전체를 숨깁니다 — 이 정책의 모든 버전·출처가 공개 화면에서 함께 가려져요. 언제든 다시 공개할 수 있어요.</>,
        confirmLabel: '비공개로 전환',
        reason: 'optional',
        onConfirm: (reason) => setPolicyPublication(policy.id, 'hide', reason),
      }),
    remove: (policy) =>
      setConfirm({
        title: '정책 삭제 (ADMIN)',
        message: <><strong>{policy.title}</strong> 정책을 삭제합니다. 공개 화면에서 사라지지만 버전·출처 기록은 남고 복원할 수 있어요.</>,
        confirmLabel: '삭제',
        danger: true,
        reason: 'optional',
        onConfirm: (reason) => deletePolicy(policy.id, reason),
      }),
    restore: (policy) =>
      setConfirm({
        title: '정책 복원 (ADMIN)',
        message: <><strong>{policy.title}</strong> 정책을 복원합니다. 공개 상태는 삭제 전 그대로입니다.</>,
        confirmLabel: '복원',
        reason: 'optional',
        onConfirm: (reason) => restorePolicy(policy.id, reason),
      }),
  };

  const versionActions: VersionActions = {
    edit: (version) => setEditingVersion({policyId: version.policyId, version, versions: []}),
    publish: (version) =>
      setConfirm({
        title: '버전 공개',
        message: <>버전 #{version.versionNo}을 공개합니다. 출처가 1개 이상 등록되고 검증이 끝난 버전만 공개할 수 있어요.</>,
        confirmLabel: '공개',
        onConfirm: () => setVersionPublication(version.id, 'publish'),
      }),
    hide: (version) =>
      setConfirm({
        title: '버전 비공개',
        message: <>버전 #{version.versionNo}을 비공개로 바꿉니다{version.isCurrent ? ' — 대표 버전 지정도 함께 풀려요(공개 화면에 보여줄 내용이 없어져요)' : ''}.</>,
        confirmLabel: '비공개로 전환',
        onConfirm: () => setVersionPublication(version.id, 'hide'),
      }),
    verify: (version) =>
      setConfirm({
        title: '확인일 갱신',
        message: <>버전 #{version.versionNo}의 공식 출처를 다시 확인했나요? 마지막 확인일만 오늘로 갱신합니다 — 검증 상태(VERIFIED 여부)는 바뀌지 않아요.</>,
        confirmLabel: '오늘 확인함',
        onConfirm: () => verifyVersion(version.id),
      }),
    verifyConfirm: (version) =>
      setConfirm({
        title: '검증 완료로 전환',
        message: <>버전 #{version.versionNo}을 등록된 공식 출처로 실제 확인했다는 뜻으로 검증 완료(VERIFIED) 처리합니다. 출처가 1개 이상 등록돼 있어야 해요.</>,
        confirmLabel: '검증 완료',
        onConfirm: () => verifyConfirmVersion(version.id),
      }),
    promote: (version) =>
      setConfirm({
        title: '대표 버전으로 지정',
        message: <>버전 #{version.versionNo}을 대표 버전으로 지정합니다. 기존 대표 버전은 대표에서 내려가지만 공개 상태는 그대로 유지돼요.</>,
        confirmLabel: '대표로 지정',
        onConfirm: () => promoteVersion(version.id),
      }),
    cancel: (version) =>
      setConfirm({
        title: '예정 변경 취소',
        message: <>버전 #{version.versionNo} 예정 변경을 취소합니다. 기록은 남고 공개 화면의 "곧 달라지는 변경"에서는 빠져요.</>,
        confirmLabel: '취소',
        danger: true,
        reason: 'required',
        reasonLabel: '취소 사유',
        onConfirm: (reason) => cancelVersion(version.id, reason),
      }),
  };

  return (
    <>
      <AdminHeading
        eyebrow="CONTENT"
        title="전기차 정책"
        description="공식 출처로 확인한 내용만 등록해주세요. 정책 항목(기본 정보)과 버전(내용·상태·검증·공개)은 따로 관리합니다."
        actions={
          selectedPolicyId === null ? (
            <button type="button" className={styles.primary} onClick={() => setEditingPolicy('new')}>
              ＋ 정책 등록
            </button>
          ) : undefined
        }
      />
      {selectedPolicyId === null && (
        <nav className={styles.subTabs} aria-label="전기차 정책 관리">
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
      )}
      <p className={styles.notice} role="status" aria-live="polite">
        {notice}
      </p>

      {selectedPolicyId !== null ? (
        <PolicyVersionsPanel
          policyId={selectedPolicyId}
          reloadKey={reloadKey}
          onBack={closePolicy}
          onError={handleError}
          policyActions={policyActions}
          versionActions={versionActions}
          onNewVersion={(policyId, versions) => setEditingVersion({policyId, version: null, versions})}
        />
      ) : (
        <>
          {tab === 'policies' && (
            <PolicyList isAdmin={isAdmin} reloadKey={reloadKey} actions={policyActions} onOpenVersions={openPolicy} onError={handleError} />
          )}
          {tab === 'stale' && <StaleList reloadKey={reloadKey} onError={handleError} onOpen={openPolicy} />}
          {tab === 'logs' && <EvLogs key={reloadKey} onAccessDenied={onAccessDenied} />}
        </>
      )}

      {editingPolicy && (
        <EvPolicyDialog
          policy={editingPolicy === 'new' ? null : editingPolicy}
          onClose={() => setEditingPolicy(null)}
          onSaved={(message, policy) => {
            changed(message);
            if (editingPolicy === 'new') openPolicy(policy.id);
          }}
        />
      )}
      {editingVersion && (
        <EvVersionDialog
          policyId={editingVersion.policyId}
          version={editingVersion.version}
          versions={editingVersion.versions}
          onClose={() => setEditingVersion(null)}
          onSaved={changed}
        />
      )}
      {confirm && <AdminConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => changed('처리했어요.')} />}
    </>
  );
}

// --- 정책 목록 ---

function PolicyList({
  isAdmin,
  reloadKey,
  actions,
  onOpenVersions,
  onError,
}: {
  isAdmin: boolean;
  reloadKey: number;
  actions: PolicyActions;
  onOpenVersions: (id: number) => void;
  onError: (e: unknown) => void;
}) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<EvCategory | ''>('');
  const [deleted, setDeleted] = useState<'exclude' | 'include' | 'only'>('exclude');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<AdminPolicy> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminPolicies({q, category, deleted, page})
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && onError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, category, deleted, page, reloadKey, onError]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <section className={styles.panel} aria-labelledby="policy-list-title">
      <h2 id="policy-list-title" className={styles.srOnly}>정책 목록</h2>
      <form className={styles.filters} role="search" onSubmit={submit}>
        <input aria-label="제목·정책 주소 검색" placeholder="제목·정책 주소 검색" maxLength={100} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select aria-label="분류" value={category} onChange={(e) => { setCategory(e.target.value as EvCategory | ''); setPage(1); }}>
          <option value="">전체 분류</option>
          {(Object.keys(CATEGORY_LABELS) as EvCategory[]).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        {isAdmin && (
          <select aria-label="삭제 여부" value={deleted} onChange={(e) => { setDeleted(e.target.value as typeof deleted); setPage(1); }}>
            <option value="exclude">삭제 제외</option>
            <option value="include">삭제 포함</option>
            <option value="only">삭제된 정책만</option>
          </select>
        )}
        <button type="submit" className={styles.secondary}>검색</button>
      </form>
      <p className={styles.count} aria-live="polite">
        {result ? `총 ${result.total}개 · ${result.page} / ${pages} 페이지` : loading ? '불러오는 중…' : ''}
      </p>
      <PolicyTable policies={result?.items ?? null} loading={loading} isAdmin={isAdmin} actions={actions} onOpenVersions={onOpenVersions} />
      <nav className={styles.pager} aria-label="페이지">
        <button type="button" className={styles.secondary} disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button>
        <button type="button" className={styles.secondary} disabled={loading || page >= pages} onClick={() => setPage((p) => p + 1)}>다음</button>
      </nav>
    </section>
  );
}

function PolicyTable({
  policies,
  loading,
  isAdmin,
  actions,
  onOpenVersions,
}: {
  policies: AdminPolicy[] | null;
  loading: boolean;
  isAdmin: boolean;
  actions: PolicyActions;
  onOpenVersions: (id: number) => void;
}) {
  return (
    <div className={styles.tableWrap} aria-busy={loading}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>정책</th>
            <th>분류</th>
            <th>대표 버전</th>
            <th>정책 공개</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {!policies || loading ? (
            <tr><td colSpan={5}>불러오는 중…</td></tr>
          ) : policies.length === 0 ? (
            <tr><td colSpan={5}>조건에 맞는 정책이 없어요.</td></tr>
          ) : (
            policies.map((policy) => {
              const deleted = !!policy.deletedAt;
              return (
                <tr key={policy.id} className={deleted ? styles.rowDeleted : undefined}>
                  <td>
                    <span className={styles.rowTitle}>{policy.title}</span>
                    <span className={styles.rowSub}>
                      /{policy.slug} · 버전 {policy.versionCount}개{policy.featured ? ' · 주요 정책' : ''}
                    </span>
                  </td>
                  <td>
                    {CATEGORY_LABELS[policy.category]}
                    <span className={styles.rowSub}>{policy.scope === 'REGIONAL' ? policy.regionNote ?? '지역 한정' : '전국 공통'}</span>
                  </td>
                  <td>
                    {policy.currentVersion ? (
                      <div className={styles.rowActions}>
                        <span className={`${styles.chip} ${styles.chipNeutral}`}>{STATUS_LABELS[policy.currentVersion.status]}</span>
                        <span className={`${styles.chip} ${policy.currentVersion.publication === 'PUBLISHED' ? styles.chipOk : styles.chipDark}`}>
                          {PUBLICATION_LABELS[policy.currentVersion.publication]}
                        </span>
                      </div>
                    ) : (
                      <span className={styles.rowSub}>대표 버전 없음</span>
                    )}
                  </td>
                  <td>
                    {deleted ? (
                      <span className={`${styles.chip} ${styles.chipBlocked}`}>삭제됨</span>
                    ) : (
                      <span className={`${styles.chip} ${policy.publication === 'PUBLISHED' ? styles.chipOk : policy.publication === 'HIDDEN' ? styles.chipDark : styles.chipNeutral}`}>
                        {PUBLICATION_LABELS[policy.publication]}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {!deleted && (
                        <>
                          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => onOpenVersions(policy.id)}>버전 관리</button>
                          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.edit(policy)}>정보 수정</button>
                          {policy.publication === 'PUBLISHED' ? (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.hide(policy)}>비공개</button>
                          ) : (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.publish(policy)}>공개</button>
                          )}
                        </>
                      )}
                      {isAdmin && !deleted && (
                        <button type="button" className={`${styles.dangerButton} ${styles.small}`} onClick={() => actions.remove(policy)}>삭제</button>
                      )}
                      {isAdmin && deleted && (
                        <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.restore(policy)}>복원</button>
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

// --- 정책 하나의 버전 관리 (목록 대신 전체 폭을 차지하는 화면으로 전환) ---

function PolicyVersionsPanel({
  policyId,
  reloadKey,
  onBack,
  onError,
  policyActions,
  versionActions,
  onNewVersion,
}: {
  policyId: number;
  reloadKey: number;
  onBack: () => void;
  onError: (e: unknown) => void;
  policyActions: PolicyActions;
  versionActions: VersionActions;
  onNewVersion: (policyId: number, versions: AdminVersion[]) => void;
}) {
  const [policy, setPolicy] = useState<AdminPolicy | null>(null);
  const [versions, setVersions] = useState<AdminVersion[] | null>(null);

  const load = useCallback(() => {
    Promise.all([fetchAdminPolicy(policyId), fetchAdminVersions(policyId)])
      .then(([p, v]) => {
        setPolicy(p);
        setVersions(v.versions);
      })
      .catch(onError);
  }, [policyId, onError]);
  useEffect(() => {
    setPolicy(null);
    setVersions(null);
    load();
  }, [load, reloadKey]);

  if (!policy || !versions) return <p className={styles.empty}>불러오는 중…</p>;

  return (
    <section className={styles.panel} aria-labelledby="policy-versions-title">
      <div className={styles.panelTop}>
        <div>
          <button type="button" className={styles.secondary} onClick={onBack}>← 정책 목록</button>
          <h2 id="policy-versions-title">{policy.title} <span className={styles.rowSub}>/{policy.slug}</span></h2>
          <p className={styles.count}>
            {CATEGORY_LABELS[policy.category]} · {policy.scope === 'REGIONAL' ? policy.regionNote ?? '지역 한정' : '전국 공통'}
          </p>
        </div>
        <div className={styles.rowActions}>
          <span className={`${styles.chip} ${policy.publication === 'PUBLISHED' ? styles.chipOk : policy.publication === 'HIDDEN' ? styles.chipDark : styles.chipNeutral}`}>
            정책 전체: {PUBLICATION_LABELS[policy.publication]}
          </span>
          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => policyActions.edit(policy)}>정책 정보 수정</button>
          {policy.publication === 'PUBLISHED' ? (
            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => policyActions.hide(policy)}>정책 전체 비공개</button>
          ) : (
            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => policyActions.publish(policy)}>정책 전체 공개</button>
          )}
        </div>
      </div>
      <div className={styles.panelTop}>
        <h3>버전</h3>
        <button type="button" className={styles.primary} onClick={() => onNewVersion(policyId, versions)}>＋ 새 버전 등록</button>
      </div>
      <VersionTable versions={versions} actions={versionActions} />
    </section>
  );
}

function VersionTable({versions, actions}: {versions: AdminVersion[]; actions: VersionActions}) {
  if (versions.length === 0) return <p className={styles.empty}>등록된 버전이 없어요.</p>;
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>버전</th>
            <th>상태</th>
            <th>검증·공개</th>
            <th>기간</th>
            <th>변경 요약</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => (
            <tr key={v.id} className={v.cancelledAt ? styles.rowDeleted : undefined}>
              <td>
                <span className={styles.rowTitle}>#{v.versionNo} {REVISION_KIND_LABELS[v.revisionKind]}</span>
                <span className={styles.rowActions}>
                  {v.isCurrent && <span className={`${styles.chip} ${styles.chipOk}`}>대표</span>}
                  {v.cancelledAt && <span className={`${styles.chip} ${styles.chipBlocked}`}>취소됨</span>}
                </span>
              </td>
              <td><span className={`${styles.chip} ${styles.chipNeutral}`}>{STATUS_LABELS[v.status]}</span></td>
              <td>
                <div className={styles.rowActions}>
                  <span className={`${styles.chip} ${v.verificationStatus === 'VERIFIED' ? styles.chipOk : styles.chipPending}`}>
                    {VERIFICATION_LABELS[v.verificationStatus]}
                  </span>
                  <span className={`${styles.chip} ${v.publication === 'PUBLISHED' ? styles.chipOk : v.publication === 'HIDDEN' ? styles.chipDark : styles.chipNeutral}`}>
                    {PUBLICATION_LABELS[v.publication]}
                  </span>
                </div>
                <span className={styles.rowSub}>출처 {v.sources.length}개 · 확인일 {v.lastVerifiedOn ?? '없음'}</span>
              </td>
              <td>
                <span className={styles.rowSub}>발표 {v.announcedOn ?? '-'}</span><br />
                <span className={styles.rowSub}>시행 {v.effectiveDate ?? '-'}</span><br />
                <span className={styles.rowSub}>종료 {v.endDateIndefinite ? '무기한' : v.endDate ?? '미확인'}</span>
              </td>
              <td>{v.changeSummary ?? (v.revisionKind === 'INITIAL' ? '최초 등록' : '-')}</td>
              <td>
                <div className={styles.rowActions}>
                  {!v.publishedAt && (
                    <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.edit(v)}>수정</button>
                  )}
                  {v.verificationStatus === 'UNVERIFIED' && (
                    <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.verifyConfirm(v)}>검증 완료</button>
                  )}
                  <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.verify(v)}>확인일 갱신</button>
                  {v.publication === 'PUBLISHED' ? (
                    <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.hide(v)}>비공개</button>
                  ) : (
                    <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.publish(v)}>공개</button>
                  )}
                  {v.publication === 'PUBLISHED' && !v.isCurrent && !v.cancelledAt && (
                    <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.promote(v)}>대표로 지정</button>
                  )}
                  {!v.isCurrent && !v.cancelledAt && (
                    <button type="button" className={`${styles.dangerButton} ${styles.small}`} onClick={() => actions.cancel(v)}>취소</button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- 재확인 대기열 ---

function StaleList({reloadKey, onError, onOpen}: {reloadKey: number; onError: (e: unknown) => void; onOpen: (policyId: number) => void}) {
  const [versions, setVersions] = useState<StaleVersion[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setVersions(null);
    fetchStaleVersions()
      .then((r) => !cancelled && setVersions(r.versions))
      .catch((e) => !cancelled && onError(e));
    return () => {
      cancelled = true;
    };
  }, [reloadKey, onError]);

  let body: ReactNode;
  if (!versions) body = <p className={styles.empty}>불러오는 중…</p>;
  else if (versions.length === 0) body = <p className={styles.empty}>재확인할 버전이 없어요.</p>;
  else
    body = (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr><th>정책</th><th>버전</th><th>상태</th><th>확인일</th><th></th></tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td>{v.title}<span className={styles.rowSub}>/{v.slug}</span></td>
                <td>#{v.versionNo}</td>
                <td><span className={`${styles.chip} ${styles.chipNeutral}`}>{STATUS_LABELS[v.status]}</span></td>
                <td>{v.lastVerifiedOn ?? '없음'}</td>
                <td><button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => onOpen(v.policyId)}>정책 열기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <section className={styles.panel} aria-labelledby="stale-title">
      <h2 id="stale-title">재확인 대기열</h2>
      <p className={styles.count}>공개 중인 버전 중 마지막 확인일이 60일보다 오래된 버전입니다(비공개·취소·삭제 제외). 공식 출처를 다시 확인한 뒤 정책을 열어 확인일을 갱신해주세요.</p>
      {body}
    </section>
  );
}
