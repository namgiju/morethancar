'use client';

import {useCallback, useState, type ReactNode} from 'react';
import {usePathname} from 'next/navigation';
import {useCommunitySession} from '../community/use-community-session';
import CommunityHeader from '../community/community-header';
import SiteFooter from '../footer/site-footer';
import type {SessionUser} from '../../lib/home-types';
import theme from '../common/theme.module.css';
import styles from './admin.module.css';

export type StaffRole = 'MANAGER' | 'ADMIN';
const RANK: Record<string, number> = {USER: 0, MANAGER: 1, ADMIN: 2};
export const hasRole = (user: SessionUser | null | undefined, min: StaffRole) => (RANK[user?.role ?? 'USER'] ?? 0) >= RANK[min];

export type NavKey =
  | 'dashboard'
  | 'motorsport'
  | 'spots'
  | 'members'
  | 'posts'
  | 'reports'
  | 'vehicles'
  | 'logs'
  | 'tags'
  | 'users';

type NavItem = {key: NavKey; label: string; href?: string; min: StaffRole};
// Menu by role. This only decides what is shown — every API behind these
// screens re-checks the current DB role on the server (Spring
// AdminController/AdminMemberController, board-service requireCurrentAdmin /
// requireCurrentStaff), so typing a URL never grants access.
const NAV: {group: string; items: NavItem[]}[] = [
  {group: '운영', items: [{key: 'dashboard', label: '대시보드', href: '/admin', min: 'MANAGER'}]},
  {
    group: '콘텐츠',
    items: [
      {key: 'motorsport', label: '모터스포츠 일정', href: '/admin/motorsport', min: 'MANAGER'},
      // Next step (drive spots): add the href when /admin/spots exists.
      {key: 'spots', label: '와인딩 스팟', min: 'MANAGER'},
    ],
  },
  {
    group: '커뮤니티 운영',
    items: [
      {key: 'members', label: '회원 관리', href: '/admin?panel=members', min: 'ADMIN'},
      {key: 'reports', label: '신고 관리', href: '/admin?panel=reports', min: 'ADMIN'},
      {key: 'posts', label: '게시글 관리', href: '/admin?panel=posts', min: 'ADMIN'},
      {key: 'vehicles', label: '차량 인증 관리', href: '/admin?panel=vehicles', min: 'ADMIN'},
      {key: 'logs', label: '운영 로그', href: '/admin?panel=logs', min: 'ADMIN'},
      {key: 'tags', label: '인장 현황', href: '/admin?panel=tags', min: 'ADMIN'},
    ],
  },
  {group: '계정', items: [{key: 'users', label: '운영자 권한', href: '/admin/users', min: 'ADMIN'}]},
];

const ROLE_LABELS: Record<string, string> = {ADMIN: '관리자 (ADMIN)', MANAGER: '콘텐츠 운영자 (MANAGER)'};

type Props = {
  active: NavKey;
  // Lowest role that may see this screen.
  require: StaffRole;
  children: (ctx: {session: SessionUser; onAccessDenied: () => void}) => ReactNode;
};

// Shared frame for every /admin screen: latest site header and footer,
// theme tokens, a role-aware side navigation and the signed-out / no
// permission states. A 401/403 from any API call switches to the denied state.
export default function AdminShell({active, require, children}: Props) {
  const auth = useCommunitySession();
  const {session} = auth;
  const pathname = usePathname();
  const [denied, setDenied] = useState(false);
  const onAccessDenied = useCallback(() => setDenied(true), []);
  const allowed = !!session && hasRole(session, require) && !denied;

  return (
    <div className={`${theme.theme} ${styles.shell}`}>
      <CommunityHeader
        auth={auth}
        search=""
        onSearchChange={() => {}}
        onSearchSubmit={(value) => {
          window.location.href = value ? `/community?q=${encodeURIComponent(value)}` : '/community';
        }}
        loginNext={encodeURIComponent(pathname)}
      />
      <main className={styles.main}>
        {session === undefined && !denied && <p className={styles.empty}>운영자 정보를 확인하고 있어요.</p>}
        {session === null && !denied && (
          <div className={styles.loginRequired}>
            <h1>로그인이 필요해요</h1>
            <p>관리자 화면은 운영자 계정으로 로그인해야 볼 수 있습니다.</p>
            <a href={`/login?next=${encodeURIComponent(pathname)}`}>로그인하기</a>
          </div>
        )}
        {session && !allowed && (
          <div className={styles.loginRequired}>
            <h1>접근 권한이 없어요</h1>
            <p>
              {require === 'ADMIN'
                ? '이 화면은 관리자(ADMIN)만 사용할 수 있습니다.'
                : '이 화면은 운영자(MANAGER) 또는 관리자(ADMIN)만 사용할 수 있습니다.'}
              {denied && ' 권한이 바뀌었다면 다시 로그인해주세요.'}
            </p>
            <a href={hasRole(session, 'MANAGER') && !denied ? '/admin' : '/'}>
              {hasRole(session, 'MANAGER') && !denied ? '관리자 대시보드로' : '홈으로 돌아가기'}
            </a>
          </div>
        )}
        {session && allowed && (
          <div className={styles.adminLayout}>
            <nav className={styles.sideNav} aria-label="관리자 메뉴">
              <p className={styles.sideNavRole}>
                <strong>{session.username}</strong>
                {ROLE_LABELS[session.role ?? ''] ?? session.role}
              </p>
              {NAV.map((group) => {
                const items = group.items.filter((item) => hasRole(session, item.min));
                if (!items.length) return null;
                return (
                  <div key={group.group} className={styles.navGroup}>
                    <h2>{group.group}</h2>
                    {items.map((item) =>
                      !item.href ? (
                        <span key={item.key} className={styles.navSoon} aria-disabled="true">
                          {item.label} <small>준비 중</small>
                        </span>
                      ) : (
                        <a
                          key={item.key}
                          href={item.href}
                          className={item.key === active ? styles.navActive : styles.navLink}
                          aria-current={item.key === active ? 'page' : undefined}
                        >
                          {item.label}
                        </a>
                      ),
                    )}
                  </div>
                );
              })}
            </nav>
            <div className={styles.content}>{children({session, onAccessDenied})}</div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}

// Page title block used at the top of every admin screen.
export function AdminHeading({eyebrow, title, description, actions}: {eyebrow: string; title: string; description?: string; actions?: ReactNode}) {
  return (
    <div className={styles.heading}>
      <div>
        <p className={styles.eyebrow}>{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className={styles.headingActions}>{actions}</div>}
    </div>
  );
}
