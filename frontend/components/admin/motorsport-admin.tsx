'use client';

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {
  ApiError,
  deleteEvent,
  fetchAdminEvents,
  fetchSeries,
  fetchStaleEvents,
  fetchVenues,
  formatInZone,
  KIND_LABELS,
  kstToday,
  PUBLICATION_LABELS,
  restoreEvent,
  setPublication,
  SOURCE_FIELD_LABELS,
  SOURCE_LABELS,
  STATUS_LABELS,
  verifyEvent,
  type AdminEvent,
  type EventStatus,
  type ImportRun,
  type SourceField,
  type MotorsportSeries,
  type MotorsportVenue,
  type Publication,
} from '../../lib/admin-motorsport';
import type {Page} from '../../lib/admin-types';
import AdminShell, {AdminHeading, hasRole} from './admin-shell';
import AdminConfirmDialog, {type ConfirmSpec} from './admin-confirm-dialog';
import MotorsportEventDialog from './motorsport-event-dialog';
import MotorsportCatalog from './motorsport-catalog';
import MotorsportLogs from './motorsport-logs';
import styles from './admin.module.css';

const TABS = [
  {key: 'events', label: '일정'},
  {key: 'stale', label: '재확인 대기열'},
  {key: 'catalog', label: '시리즈·장소'},
  {key: 'logs', label: '변경 이력'},
] as const;
type TabKey = (typeof TABS)[number]['key'];
const isTab = (v: string | null): v is TabKey => TABS.some((t) => t.key === v);

const STALE_DAYS = 14;
const daysSince = (date: string) => Math.round((Date.parse(`${kstToday()}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);

// /admin/motorsport — MANAGER and ADMIN manage the schedule from the web.
export default function MotorsportAdmin() {
  return (
    <AdminShell active="motorsport" require="MANAGER">
      {({session, onAccessDenied}) => <MotorsportWorkspace isAdmin={hasRole(session, 'ADMIN')} onAccessDenied={onAccessDenied} />}
    </AdminShell>
  );
}

function MotorsportWorkspace({isAdmin, onAccessDenied}: {isAdmin: boolean; onAccessDenied: () => void}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab: TabKey = isTab(tabParam) ? tabParam : 'events';

  const [series, setSeries] = useState<MotorsportSeries[]>([]);
  const [venues, setVenues] = useState<MotorsportVenue[]>([]);
  const [notice, setNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<AdminEvent | 'new' | null>(searchParams.get('new') === '1' ? 'new' : null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
      else setNotice(e instanceof Error ? e.message : '요청을 처리하지 못했어요.');
    },
    [onAccessDenied],
  );

  const loadCatalog = useCallback(() => {
    Promise.all([fetchSeries(), fetchVenues()])
      .then(([s, v]) => {
        setSeries(s);
        setVenues(v);
      })
      .catch(handleError);
  }, [handleError]);
  useEffect(loadCatalog, [loadCatalog, reloadKey]);

  function changed(message: string) {
    setNotice(message);
    setReloadKey((k) => k + 1);
  }

  function setTab(next: TabKey) {
    const params = new URLSearchParams(searchParams);
    params.delete('new');
    if (next === 'events') params.delete('tab');
    else params.set('tab', next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
  }

  // Row actions shared by the event list and the stale queue.
  const actions = {
    edit: (event: AdminEvent) => setEditing(event),
    publish: (event: AdminEvent) =>
      setConfirm({
        title: '일정 공개',
        message: <><strong>{event.title}</strong> 일정을 공개 화면에 보이게 합니다.</>,
        confirmLabel: '공개',
        onConfirm: () => setPublication(event.id, 'publish'),
      }),
    hide: (event: AdminEvent) =>
      setConfirm({
        title: '일정 비공개',
        message: <><strong>{event.title}</strong> 일정을 공개 화면에서 숨깁니다. 언제든 다시 공개할 수 있어요.</>,
        confirmLabel: '비공개로 전환',
        reason: 'optional',
        onConfirm: (reason) => setPublication(event.id, 'hide', reason),
      }),
    verify: (event: AdminEvent) =>
      setConfirm({
        title: '공식 출처 확인일 갱신',
        message: (
          <>
            <a className={styles.textLink} href={event.sourceUrl} target="_blank" rel="noopener noreferrer">{event.sourceName}</a>에서
            일정을 다시 확인했나요? 마지막 확인일을 오늘({kstToday()})로 바꿉니다.
          </>
        ),
        confirmLabel: '오늘 확인함',
        onConfirm: () => verifyEvent(event.id),
      }),
    remove: (event: AdminEvent) =>
      setConfirm({
        title: '일정 삭제 (ADMIN)',
        message: <><strong>{event.title}</strong> 일정을 삭제합니다. 공개 화면에서 사라지지만 기록은 남고 복원할 수 있어요. 연결된 후기 글 {event.linkedPostCount}개는 그대로 남습니다.</>,
        confirmLabel: '삭제',
        danger: true,
        reason: 'optional',
        onConfirm: (reason) => deleteEvent(event.id, reason),
      }),
    restore: (event: AdminEvent) =>
      setConfirm({
        title: '일정 복원 (ADMIN)',
        message: <><strong>{event.title}</strong> 일정을 복원합니다. 공개 상태는 삭제 전 그대로입니다.</>,
        confirmLabel: '복원',
        reason: 'optional',
        onConfirm: (reason) => restoreEvent(event.id, reason),
      }),
  };

  return (
    <>
      <AdminHeading
        eyebrow="CONTENT"
        title="모터스포츠 일정"
        description="공식 출처에서 확인한 일정만 등록하고, 다가오는 일정은 확인일을 주기적으로 갱신해주세요."
        actions={
          <button type="button" className={styles.primary} onClick={() => setEditing('new')}>
            ＋ 일정 등록
          </button>
        }
      />
      <nav className={styles.subTabs} aria-label="모터스포츠 관리">
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
      {tab === 'events' && <EventList isAdmin={isAdmin} reloadKey={reloadKey} actions={actions} onError={handleError} />}
      {tab === 'stale' && <StaleList isAdmin={isAdmin} reloadKey={reloadKey} actions={actions} onError={handleError} />}
      {tab === 'catalog' && <MotorsportCatalog series={series} venues={venues} onChanged={changed} />}
      {tab === 'logs' && <MotorsportLogs key={reloadKey} onAccessDenied={onAccessDenied} />}

      {editing && (
        <MotorsportEventDialog
          event={editing === 'new' ? null : editing}
          series={series}
          venues={venues}
          onClose={() => setEditing(null)}
          onSaved={changed}
        />
      )}
      {confirm && <AdminConfirmDialog spec={confirm} onClose={() => setConfirm(null)} onDone={() => changed('처리했어요.')} />}
    </>
  );
}

type Actions = Record<'edit' | 'publish' | 'hide' | 'verify' | 'remove' | 'restore', (event: AdminEvent) => void>;

function EventList({isAdmin, reloadKey, actions, onError}: {isAdmin: boolean; reloadKey: number; actions: Actions; onError: (e: unknown) => void}) {
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');
  const [publication, setPublicationFilter] = useState<Publication | ''>('');
  const [status, setStatus] = useState<EventStatus | ''>('');
  const [deleted, setDeleted] = useState<'exclude' | 'include' | 'only'>('exclude');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Page<AdminEvent> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAdminEvents({q, publication, status, deleted, page})
      .then((r) => !cancelled && setResult(r))
      .catch((e) => !cancelled && onError(e))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [q, publication, status, deleted, page, reloadKey, onError]);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPage(1);
    setQ(qInput.trim());
  }

  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  return (
    <section className={styles.panel} aria-labelledby="event-list-title">
      <h2 id="event-list-title" className={styles.srOnly}>일정 목록</h2>
      <form className={styles.filters} role="search" onSubmit={submit}>
        <input aria-label="일정명·출처 검색" placeholder="일정명·출처 검색" maxLength={100} value={qInput} onChange={(e) => setQInput(e.target.value)} />
        <select aria-label="공개 상태" value={publication} onChange={(e) => { setPublicationFilter(e.target.value as Publication | ''); setPage(1); }}>
          <option value="">전체 공개 상태</option>
          {(Object.keys(PUBLICATION_LABELS) as Publication[]).map((p) => <option key={p} value={p}>{PUBLICATION_LABELS[p]}</option>)}
        </select>
        <select aria-label="진행 상태" value={status} onChange={(e) => { setStatus(e.target.value as EventStatus | ''); setPage(1); }}>
          <option value="">전체 진행 상태</option>
          {(Object.keys(STATUS_LABELS) as EventStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
        {isAdmin && (
          <select aria-label="삭제 여부" value={deleted} onChange={(e) => { setDeleted(e.target.value as typeof deleted); setPage(1); }}>
            <option value="exclude">삭제 제외</option>
            <option value="include">삭제 포함</option>
            <option value="only">삭제된 일정만</option>
          </select>
        )}
        <button type="submit" className={styles.secondary}>검색</button>
      </form>
      <p className={styles.count} aria-live="polite">
        {result ? `총 ${result.total}개 · ${result.page} / ${pages} 페이지 · 최근 시작일 순` : loading ? '불러오는 중…' : ''}
      </p>
      <EventTable events={result?.items ?? null} loading={loading} isAdmin={isAdmin} actions={actions} empty="조건에 맞는 일정이 없어요." />
      <nav className={styles.pager} aria-label="페이지">
        <button type="button" className={styles.secondary} disabled={loading || page <= 1} onClick={() => setPage((p) => p - 1)}>이전</button>
        <button type="button" className={styles.secondary} disabled={loading || page >= pages} onClick={() => setPage((p) => p + 1)}>다음</button>
      </nav>
    </section>
  );
}

function StaleList({isAdmin, reloadKey, actions, onError}: {isAdmin: boolean; reloadKey: number; actions: Actions; onError: (e: unknown) => void}) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [runs, setRuns] = useState<ImportRun[]>([]);
  useEffect(() => {
    let cancelled = false;
    setEvents(null);
    fetchStaleEvents()
      .then((r) => {
        if (cancelled) return;
        setEvents(r.events);
        setRuns(r.importRuns ?? []);
      })
      .catch((e) => !cancelled && onError(e));
    return () => {
      cancelled = true;
    };
  }, [reloadKey, onError]);
  return (
    <section className={styles.panel} aria-labelledby="stale-title">
      <h2 id="stale-title">재확인 대기열</h2>
      <p className={styles.count}>앞으로 60일 안의 일정 중 마지막 확인일이 {STALE_DAYS}일보다 오래된 일정(비공개·취소·삭제 제외)과, 자동 수집한 출처의 변경이 운영자가 고친 값과 달라 반영되지 않은 일정입니다. 공식 출처를 확인한 뒤 필요하면 &ldquo;수정&rdquo;으로 고치고 &ldquo;확인일 갱신&rdquo;을 눌러주세요.</p>
      {runs.length > 0 && <ImportRuns runs={runs} />}
      <EventTable events={events} loading={events === null} isAdmin={isAdmin} actions={actions} empty="재확인할 일정이 없어요." />
    </section>
  );
}

// 출처별 마지막 자동 수집 결과. 실패했거나 마지막 성공이 이틀보다 오래되면 경고로 표시한다(하루 한 번 실행).
function ImportRuns({runs}: {runs: ImportRun[]}) {
  const staleBefore = Date.now() - 2 * 86_400_000;
  return (
    <ul className={styles.count}>
      {runs.map((run) => {
        const late = !run.lastSuccessAt || Date.parse(run.lastSuccessAt) < staleBefore;
        const s = run.summary ?? {};
        return (
          <li key={run.source}>
            <span className={`${styles.chip} ${run.ok === false || late ? styles.chipBlocked : styles.chipOk}`}>
              {run.ok === false ? '수집 실패' : late ? '수집 지연' : '수집 정상'}
            </span>{' '}
            {SOURCE_LABELS[run.source] ?? run.source} · 마지막 실행 {formatInZone(run.startedAt, 'Asia/Seoul')}
            {run.lastSuccessAt ? ` · 마지막 성공 ${formatInZone(run.lastSuccessAt, 'Asia/Seoul')}` : ' · 성공 기록 없음'}
            {run.ok !== false && ` · 수집 ${s.collected ?? 0} / 신규 ${s.inserted ?? 0} / 갱신 ${s.updated ?? 0} / 충돌 ${s.conflict ?? 0} / 출처에서 사라짐 ${s.missing ?? 0}`}
            {run.error && ` · ${run.error}`}
          </li>
        );
      })}
    </ul>
  );
}

// 출처 변경 중 반영하지 못한 필드와 출처의 새 값.
function sourceChanges(event: AdminEvent): string[] {
  if (!event.sourceReview || !event.sourceLatest) return [];
  const before = event.sourceSnapshot ?? {};
  return (Object.keys(event.sourceLatest) as SourceField[])
    .filter((field) => (event.sourceLatest?.[field] ?? null) !== (before[field] ?? null))
    .map((field) => {
      const value = event.sourceLatest?.[field] ?? null;
      const shown = field === 'startsAt' && typeof value === 'string' ? `${formatInZone(value, 'Asia/Seoul')} KST` : String(value ?? '없음');
      return `${SOURCE_FIELD_LABELS[field]} → ${shown}`;
    });
}

function EventTable({events, loading, isAdmin, actions, empty}: {events: AdminEvent[] | null; loading: boolean; isAdmin: boolean; actions: Actions; empty: string}) {
  return (
    <div className={styles.tableWrap} aria-busy={loading}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>기간 (현지)</th>
            <th>일정</th>
            <th>장소</th>
            <th>상태</th>
            <th>공식 출처 · 확인일</th>
            <th>작업</th>
          </tr>
        </thead>
        <tbody>
          {!events || loading ? (
            <tr><td colSpan={6}>불러오는 중…</td></tr>
          ) : events.length === 0 ? (
            <tr><td colSpan={6}>{empty}</td></tr>
          ) : (
            events.map((event) => {
              const deleted = !!event.deletedAt;
              const age = daysSince(event.verifiedOn);
              return (
                <tr key={event.id} className={deleted ? styles.rowDeleted : undefined}>
                  <td>
                    <span className={styles.rowTitle}>
                      {event.startsOn}
                      {event.endsOn !== event.startsOn ? ` ~ ${event.endsOn.slice(5)}` : ''}
                    </span>
                    {event.startsAt && (
                      <span className={styles.rowSub}>
                        {formatInZone(event.startsAt, 'Asia/Seoul')} KST
                        {event.venue.timezone !== 'Asia/Seoul' ? ` (현지 ${formatInZone(event.startsAt, event.venue.timezone)})` : ''}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={styles.rowTitle}>{event.title}</span>
                    <span className={styles.rowSub}>
                      {KIND_LABELS[event.kind]}
                      {event.series ? ` · ${event.series.name}` : ''} · #{event.id}
                      {event.linkedPostCount ? ` · 후기 ${event.linkedPostCount}` : ''}
                    </span>
                  </td>
                  <td>
                    {event.venue.name}
                    <span className={styles.rowSub}>{event.venue.country}{event.venue.timezone !== 'Asia/Seoul' ? ` · ${event.venue.timezone}` : ''}</span>
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {deleted ? (
                        <span className={`${styles.chip} ${styles.chipBlocked}`}>삭제됨</span>
                      ) : (
                        <span className={`${styles.chip} ${event.publication === 'PUBLISHED' ? styles.chipOk : event.publication === 'HIDDEN' ? styles.chipDark : styles.chipNeutral}`}>
                          {PUBLICATION_LABELS[event.publication]}
                        </span>
                      )}
                      <span className={`${styles.chip} ${event.status === 'CANCELLED' ? styles.chipBlocked : event.status === 'SCHEDULED' ? styles.chipNeutral : styles.chipPending}`}>
                        {STATUS_LABELS[event.status]}
                      </span>
                    </div>
                  </td>
                  <td>
                    <a className={styles.textLink} href={event.sourceUrl} target="_blank" rel="noopener noreferrer">{event.sourceName}</a>
                    <span className={styles.rowSub}>
                      {event.verifiedOn} 확인{age > STALE_DAYS ? ` · ${age}일 지남` : ''}
                      {event.sourceCheckedAt ? ` · 자동 수집 ${formatInZone(event.sourceCheckedAt, 'Asia/Seoul')}` : ''}
                    </span>
                    {sourceChanges(event).map((change) => (
                      <span key={change} className={`${styles.rowSub} ${styles.chipPending}`}>출처 변경 미반영: {change}</span>
                    ))}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {!deleted && (
                        <>
                          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.edit(event)}>수정</button>
                          {event.publication === 'PUBLISHED' ? (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.hide(event)}>비공개</button>
                          ) : (
                            <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.publish(event)}>공개</button>
                          )}
                          <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.verify(event)}>확인일 갱신</button>
                        </>
                      )}
                      {isAdmin && !deleted && (
                        <button type="button" className={`${styles.dangerButton} ${styles.small}`} onClick={() => actions.remove(event)}>삭제</button>
                      )}
                      {isAdmin && deleted && (
                        <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => actions.restore(event)}>복원</button>
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
