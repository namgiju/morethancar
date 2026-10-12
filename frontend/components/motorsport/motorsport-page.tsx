'use client';

import type {ReactNode} from 'react';
import SiteHeader from '../common/site-header';
import SiteFooter from '../footer/site-footer';
import theme from '../common/theme.module.css';
import {useCommunitySession} from '../community/use-community-session';
import styles from './motorsport.module.css';

// Shared frame for /motorsport and /motorsport/[id]: same white-theme shell
// (header, footer, 1320px container) as the rest of the redesign — mirrors
// components/home/home-shell.tsx and components/community/community-page.tsx.
export default function MotorsportPage({children}: {children: ReactNode}) {
  const auth = useCommunitySession();
  const {sessionError} = auth;

  return (
    <div className={`${theme.theme} ${styles.shell}`}>
      <SiteHeader auth={auth} />
      {sessionError && (
        <p className={styles.notice} role="status">
          로그인 상태를 확인하지 못했어요. 새로고침해주세요.
        </p>
      )}
      <main className={styles.page}>
        <div className={styles.container}>{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
