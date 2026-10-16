'use client';

import {useState, type FormEvent} from 'react';
import {usePathname} from 'next/navigation';
import {SERVICES, type ServiceKey} from '../../lib/services';
import type {CommunitySession} from '../community/use-community-session';
import {ActivityPanel, NotificationsPanel} from '../community/header-panels';
import {BellIcon, SearchIcon} from './icons';
import Logo from './logo';
import theme from './theme.module.css';
import styles from './site-header.module.css';

type Props = {
  auth: Pick<CommunitySession, 'session' | 'unread' | 'setUnread' | 'logoutBusy' | 'handleLogout'>;
  // Controlled search (the community list keeps the box in sync with its
  // own query). Without these the header keeps its own text and submitting
  // goes to /community?q=…
  search?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: (value: string) => void;
  // Where the login page sends the user back to (already URL-encoded path).
  loginNext?: string;
};

function activeService(pathname: string): ServiceKey | null {
  if (pathname === '/community' || pathname.startsWith('/community/')) return 'community';
  if (pathname === '/home') return 'garage';
  if (pathname === '/motorsport' || pathname.startsWith('/motorsport/')) return 'motorsport';
  if (pathname === '/spots' || pathname.startsWith('/spots/')) return 'spots';
  if (pathname === '/ev' || pathname.startsWith('/ev/')) return 'ev';
  return null;
}

// Site-wide header (main page, community, 내 차고, admin …): logo, the five
// services (unreleased ones shown as SOON without a link — lib/services.ts),
// search, and for members the 내 활동 / 알림 panels and the account menu.
// The parts market is paused and not listed.
export default function SiteHeader({auth, search, onSearchChange, onSearchSubmit, loginNext}: Props) {
  const {session, unread, setUnread, logoutBusy, handleLogout} = auth;
  const pathname = usePathname();
  const [panel, setPanel] = useState<'activity' | 'notifications' | null>(null);
  const [ownSearch, setOwnSearch] = useState('');
  const searchValue = search ?? ownSearch;
  const current = activeService(pathname);
  const next = loginNext ?? encodeURIComponent(pathname);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = searchValue.trim();
    if (onSearchSubmit) onSearchSubmit(value);
    else window.location.href = value ? `/community?q=${encodeURIComponent(value)}` : '/community';
  }

  return (
    <header className={`${theme.theme} ${styles.header}`}>
      {session && panel === 'activity' && <ActivityPanel user={session} onClose={() => setPanel(null)} />}
      {session && panel === 'notifications' && (
        <NotificationsPanel onClose={() => setPanel(null)} onRead={() => setUnread(0)} />
      )}
      <div className={styles.inner}>
        <a href="/" className={styles.logo} aria-label="morethancar 홈">
          <Logo height={60} className={styles.logoImage} />
        </a>

        <nav className={styles.nav} aria-label="주 메뉴">
          {SERVICES.map((service) =>
            service.href ? (
              <a
                key={service.key}
                href={service.href}
                aria-current={current === service.key ? 'page' : undefined}
              >
                {service.label}
              </a>
            ) : (
              <span key={service.key} className={styles.soon} aria-disabled="true" title="오픈 예정">
                {service.label}
                <small>SOON</small>
              </span>
            ),
          )}
          {(session?.role === 'ADMIN' || session?.role === 'MANAGER') && (
            <a href="/admin" aria-current={pathname.startsWith('/admin') ? 'page' : undefined}>
              관리
            </a>
          )}
        </nav>

        <form className={styles.search} role="search" onSubmit={submitSearch}>
          <label className={styles.srOnly} htmlFor="site-search">
            차종, 게시글, 유저 검색
          </label>
          <input
            id="site-search"
            type="search"
            placeholder="차종, 게시글, 유저 검색"
            value={searchValue}
            onChange={(e) => (onSearchChange ? onSearchChange(e.target.value) : setOwnSearch(e.target.value))}
            maxLength={100}
          />
          <button type="submit" aria-label="검색">
            <SearchIcon size={17} />
          </button>
        </form>

        <div className={styles.account}>
          {session === undefined ? null : session ? (
            <>
              <button type="button" className={styles.activityButton} onClick={() => setPanel('activity')}>
                내 활동
              </button>
              <button
                type="button"
                className={styles.bell}
                aria-label={unread ? `알림, 읽지 않은 알림 ${unread}개` : '알림, 새 알림 없음'}
                onClick={() => setPanel('notifications')}
              >
                <BellIcon size={20} />
                {unread > 0 && <span className={styles.bellCount}>{unread > 99 ? '99+' : unread}</span>}
              </button>
              <details className={styles.userMenu}>
                <summary aria-label={`${session.username} 님 메뉴`}>
                  <span className={styles.avatar} aria-hidden="true">
                    {[...session.username][0]?.toUpperCase() || ''}
                  </span>
                </summary>
                <div className={styles.userMenuPanel}>
                  <strong>{session.username} 님</strong>
                  <a href="/home">내 차고</a>
                  <button type="button" onClick={() => setPanel('activity')}>
                    내 활동
                  </button>
                  {(session.role === 'ADMIN' || session.role === 'MANAGER') && <a href="/admin">관리</a>}
                  <button type="button" disabled={logoutBusy} onClick={handleLogout}>
                    로그아웃
                  </button>
                </div>
              </details>
            </>
          ) : (
            <a className={styles.loginButton} href={`/login?next=${next}`}>
              로그인 / 가입
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
