import {SERVICES} from '../../lib/services';
import {ChevronIcon, ServiceIcon} from '../common/icons';
import styles from './main.module.css';

// Shortcut row under the first screen. Services without a page yet are shown
// as "오픈 예정" without a link (see lib/services.ts).
export default function ServiceShortcuts() {
  return (
    <nav className={styles.shortcuts} aria-label="서비스 바로가기">
      {SERVICES.map((service) => {
        const body = (
          <>
            <ServiceIcon service={service.key} size={26} className={styles.shortcutIcon} />
            <span className={styles.shortcutText}>
              <strong>
                {service.label}
                {!service.href && <small className={styles.soonTag}>오픈 예정</small>}
              </strong>
              <span>{service.description}</span>
            </span>
            {service.href && <ChevronIcon size={18} className={styles.shortcutChevron} />}
          </>
        );
        return service.href ? (
          <a key={service.key} href={service.href} className={styles.shortcut}>
            {body}
          </a>
        ) : (
          <div key={service.key} className={styles.shortcut} aria-disabled="true">
            {body}
          </div>
        );
      })}
    </nav>
  );
}
