'use client';

import {useEffect, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {ApiError, fetchAdminEvents, fetchStaleEvents} from '../../lib/admin-motorsport';
import AdminShell, {AdminHeading, hasRole, type NavKey} from './admin-shell';
import OverviewPanel from './overview-panel';
import MembersPanel from './members-panel';
import PostsPanel from './posts-panel';
import LogsPanel from './logs-panel';
import ReportsPanel from './reports-panel';
import VehiclesPanel from './vehicles-panel';
import TagsPanel from './tags-panel';
import styles from './admin.module.css';

// Existing ADMIN-only community panels, still addressed as /admin?panel=…
// (links and bookmarks from before the redesign keep working).
const PANELS = {
  members: {label: '회원 관리', description: '회원 검색, 상태·권한 변경, 비밀번호 재설정 요청'},
  posts: {label: '게시글 관리', description: '게시글 검색과 신고 수 확인'},
  logs: {label: '운영 로그', description: '관리자 삭제 기록과 원문'},
  reports: {label: '신고 관리', description: '신고 검토와 처리 결과 기록'},
  vehicles: {label: '차량 인증 관리', description: '자동차등록증 확인 후 승인·거절'},
  tags: {label: '인장 현황', description: '인장별 보유 회원 수'},
} as const;
type PanelKey = keyof typeof PANELS;
const isPanelKey = (value: string | null): value is PanelKey => !!value && value in PANELS;

// /admin — role-aware dashboard. MANAGER sees content tools only; ADMIN
// also gets the existing community operations (?panel=) and operator roles.
export default function AdminApp() {
  const searchParams = useSearchParams();
  const panelParam = searchParams.get('panel');
  const panel = isPanelKey(panelParam) ? panelParam : null;

  if (panel) {
    return (
      <AdminShell active={panel as NavKey} require="ADMIN">
        {({onAccessDenied}) => (
          <>
            <AdminHeading eyebrow="커뮤니티 운영" title={PANELS[panel].label} description={PANELS[panel].description} />
            {panel === 'members' && <MembersPanel onAccessDenied={onAccessDenied} />}
            {panel === 'posts' && <PostsPanel onAccessDenied={onAccessDenied} />}
            {panel === 'logs' && <LogsPanel onAccessDenied={onAccessDenied} />}
            {panel === 'reports' && <ReportsPanel onAccessDenied={onAccessDenied} />}
            {panel === 'vehicles' && <VehiclesPanel onAccessDenied={onAccessDenied} />}
            {panel === 'tags' && <TagsPanel onAccessDenied={onAccessDenied} />}
          </>
        )}
      </AdminShell>
    );
  }

  return (
    <AdminShell active="dashboard" require="MANAGER">
      {({session, onAccessDenied}) => (
        <>
          <AdminHeading
            eyebrow="ADMIN"
            title="관리자 대시보드"
            description={
              hasRole(session, 'ADMIN')
                ? '콘텐츠와 커뮤니티 운영, 운영자 권한을 한곳에서 관리합니다.'
                : '모터스포츠 일정 등 콘텐츠를 등록하고 관리합니다.'
            }
          />
          <ContentSummary onAccessDenied={onAccessDenied} />
          {hasRole(session, 'ADMIN') && (
            <>
              <OverviewPanel onAccessDenied={onAccessDenied} />
              <section className={styles.panel} aria-labelledby="community-ops-title">
                <h2 id="community-ops-title">커뮤니티 운영</h2>
                <div className={styles.cardGrid}>
                  {(Object.keys(PANELS) as PanelKey[]).map((key) => (
                    <a key={key} className={styles.navCard} href={`/admin?panel=${key}`}>
                      <strong>{PANELS[key].label}</strong>
                      <span>{PANELS[key].description}</span>
                      <em>열기 →</em>
                    </a>
                  ))}
                  <a className={styles.navCard} href="/admin/users">
                    <strong>운영자 권한</strong>
                    <span>MANAGER 지정·해제, ADMIN 지정과 변경 기록</span>
                    <em>열기 →</em>
                  </a>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </AdminShell>
  );
}

type Counts = {published: number; draft: number; hidden: number; stale: number};

// Content numbers for MANAGER and ADMIN: totals per publication state (the
// admin list API's `total`) and the re-verification queue.
function ContentSummary({onAccessDenied}: {onAccessDenied: () => void}) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAdminEvents({publication: 'PUBLISHED'}),
      fetchAdminEvents({publication: 'DRAFT'}),
      fetchAdminEvents({publication: 'HIDDEN'}),
      fetchStaleEvents(),
    ])
      .then(([p, d, h, s]) => {
        if (!cancelled) setCounts({published: p.total, draft: d.total, hidden: h.total, stale: s.events.length});
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
        else setError(e instanceof Error ? e.message : '콘텐츠 현황을 불러오지 못했어요.');
      });
    return () => {
      cancelled = true;
    };
  }, [onAccessDenied]);

  const tiles: [keyof Counts, string][] = [
    ['published', '공개 일정'],
    ['draft', '초안'],
    ['hidden', '비공개'],
    ['stale', '재확인 필요'],
  ];
  return (
    <section className={styles.panel} aria-labelledby="content-title">
      <div className={styles.panelTop}>
        <h2 id="content-title">콘텐츠</h2>
        <a className={styles.primary} href="/admin/motorsport?new=1">
          ＋ 일정 등록
        </a>
      </div>
      {error ? (
        <p className={styles.errorText}>{error}</p>
      ) : (
        <div className={styles.statRow}>
          {tiles.map(([key, label]) => (
            <div key={key} className={`${styles.statTile} ${key === 'stale' && counts?.stale ? styles.statAlert : ''}`}>
              <p>{label}</p>
              <strong>{counts ? counts[key] : '–'}</strong>
            </div>
          ))}
        </div>
      )}
      <div className={styles.cardGrid}>
        <a className={styles.navCard} href="/admin/motorsport">
          <strong>모터스포츠 일정</strong>
          <span>일정 등록·수정, 공개·비공개, 공식 출처 확인일, 시리즈·장소, 변경 이력</span>
          <em>열기 →</em>
        </a>
        <a className={styles.navCard} href="/admin/motorsport?tab=stale">
          <strong>재확인 대기열</strong>
          <span>다가오는 일정 중 공식 출처 확인이 14일 넘게 지난 일정</span>
          <em>열기 →</em>
        </a>
        <a className={styles.navCard} href="/admin/spots">
          <strong>스팟 (와인딩·심레이싱)</strong>
          <span>스팟 등록·수정, 공개·비공개, 변경 이력</span>
          <em>열기 →</em>
        </a>
      </div>
    </section>
  );
}
