import type {GarageEntry} from '../../lib/home-types';
import {imageUrl, memberUrl} from '../../lib/format';
import {CarIcon} from './icons';
import styles from './main.module.css';

// "오늘의 차고": up to three public vehicles from GET /api/board/garage, picked
// per day by lib/format.ts's pickGarageShowcase. Each card opens the owner's
// existing public garage page.
export default function GarageShowcase({vehicles}: {vehicles: GarageEntry[]}) {
  return (
    <section className={styles.lowerPanel} aria-labelledby="garage-title">
      <div className={styles.panelHead}>
        <h2 id="garage-title">
          오늘의 차고 <span className={styles.panelCaption}>회원들이 등록한 차량</span>
        </h2>
        <a href="/home">내 차고 →</a>
      </div>
      {!vehicles.length ? (
        <p className={styles.emptyLine}>
          아직 공개된 차량이 없어요. <a href="/home">내 차고에서 첫 차량 등록하기 →</a>
        </p>
      ) : (
        <ul className={styles.garageGrid}>
          {vehicles.map((v) => (
            <li key={v.id}>
              <a href={memberUrl(v.ownerId)} className={styles.garageCard}>
                <span className={styles.garagePhoto}>
                  {v.imageId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageUrl(v.imageId)} alt={v.model} loading="lazy" />
                  ) : (
                    <CarIcon size={40} />
                  )}
                </span>
                <span className={styles.garageModel}>{v.model}</span>
                <span className={styles.garageDetail}>
                  {[v.year ? `${v.year}년` : null, v.trim || null].filter(Boolean).join(' · ')}
                </span>
                <span className={styles.garageOwner}>
                  @{v.username}
                  {v.recordCount > 0 && <span> · 기록 {v.recordCount}개</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
