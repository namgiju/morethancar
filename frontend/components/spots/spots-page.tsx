'use client';

import type {ReactNode} from 'react';
import SiteHeader from '../common/site-header';
import SiteFooter from '../footer/site-footer';
import theme from '../common/theme.module.css';
import {useCommunitySession} from '../community/use-community-session';
import styles from './spots.module.css';

// /spots와 /spots/[id]가 함께 쓰는 틀. components/motorsport/motorsport-page.tsx와 같은 패턴
// (공통 헤더·푸터, 1320px 컨테이너, 화이트 테마).
export default function SpotsPage({children}: {children: ReactNode}) {
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
