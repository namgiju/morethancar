// Ported from assignment-frontend/js/footer.js + css/footer.css — same
// copy/links/structure, restyled with this app's CSS Modules instead of the
// old global stylesheet. No session/role/API dependency, same as the
// original ("Shared service footer."). Usable on any page: import and
// render as the last child of the page's root element.
'use client';

import Logo from '../common/logo';
import styles from './site-footer.module.css';

function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
  });
}

export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
            <a href="/" aria-label="morethancar 홈">
              <Logo height={60} />
            </a>
            <p>차, 그 이상.</p>
          </div>
          <nav className={styles.services} aria-label="Footer 서비스">
            <h2>서비스</h2>
            <a href="/community">커뮤니티</a>
            <a href="/home">내 차고</a>
          </nav>
          <div className={styles.info}>
            <h2>morethancar</h2>
            <dl>
              <div>
                <dt>운영자</dt>
                <dd>남기주</dd>
              </div>
              <div>
                <dt>이메일</dt>
                <dd>
                  <a href="mailto:wjswkemd@gmail.com">wjswkemd@gmail.com</a>
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className={styles.bottom}>
          <div>
            <p className={styles.copyright}>
              <span>© 2026 morethancar</span>
              <span>Built for car people.</span>
            </p>
          </div>
          <button type="button" className={styles.toTop} onClick={scrollToTop}>
            맨 위로 ↑
          </button>
        </div>
      </div>
    </footer>
  );
}
