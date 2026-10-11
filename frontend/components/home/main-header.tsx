'use client';

import {useState, type FormEvent} from 'react';
import type {SessionUser} from '../../lib/home-types';
import {SERVICES} from '../../lib/services';
import Logo from '../common/logo';
import {BellIcon, SearchIcon} from './icons';
import styles from './main.module.css';

// Main page header: logo, the five services (unreleased ones are shown but not
// linked — see lib/services.ts), the existing community search, notification
// count and the account menu. Parts market is intentionally not listed.
export default function MainHeader({
  session,
  unread,
  busy,
  onLogout,
}: {
  // undefined = still checking the session cookie.
  session: SessionUser | null | undefined;
  unread: number;
  busy: boolean;
  onLogout: () => void;
}) {
  const [search, setSearch] = useState('');

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = search.trim();
    window.location.href = value ? `/community?q=${encodeURIComponent(value)}` : '/community';
  }

  return (
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a href="/" className={styles.logo} aria-label="morethancar 홈">
          <Logo height={60} className={styles.logoImage} />
        </a>

        <nav className={styles.nav} aria-label="주 메뉴">
          {SERVICES.map((service) =>
            service.href ? (
              <a key={service.key} href={service.href}>
                {service.label}
              </a>
            ) : (
              <span key={service.key} className={styles.navSoon} aria-disabled="true" title="오픈 예정">
                {service.label}
                <small>SOON</small>
              </span>
            ),
          )}
          {session?.role === 'ADMIN' && <a href="/admin">관리</a>}
        </nav>

        <form className={styles.search} role="search" onSubmit={submitSearch}>
          <label className={styles.srOnly} htmlFor="main-search">
            차종, 게시글, 유저 검색
          </label>
          <input
            id="main-search"
            type="search"
            placeholder="차종, 게시글, 유저 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            maxLength={100}
          />
          <button type="submit" aria-label="검색">
            <SearchIcon size={17} />
          </button>
        </form>

        <div className={styles.account}>
          {session === undefined ? null : session ? (
            <>
              <span
                className={styles.bell}
                role="img"
                aria-label={unread ? `읽지 않은 알림 ${unread}개` : '새 알림 없음'}
              >
                <BellIcon size={20} />
                {unread > 0 && <span className={styles.bellCount}>{unread > 99 ? '99+' : unread}</span>}
              </span>
              <details className={styles.userMenu}>
                <summary aria-label={`${session.username} 님 메뉴`}>
                  <span className={styles.avatar} aria-hidden="true">
                    {[...session.username][0]?.toUpperCase() || ''}
                  </span>
                </summary>
                <div className={styles.userMenuPanel}>
                  <strong>{session.username} 님</strong>
                  <a href="/home">내 차고</a>
                  <a href="/community?scope=mine">내가 쓴 글</a>
                  {session.role === 'ADMIN' && <a href="/admin">관리</a>}
                  <button type="button" disabled={busy} onClick={onLogout}>
                    로그아웃
                  </button>
                </div>
              </details>
            </>
          ) : (
            <a className={styles.loginButton} href="/login?next=%2F">
              로그인 / 가입
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
