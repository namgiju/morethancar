import {CATEGORY_LABELS, REGIONS, type SpotCategory} from '../../lib/spots-types';
import styles from './spots.module.css';

const CATEGORIES: {value: SpotCategory | ''; label: string}[] = [
  {value: '', label: '전체'},
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({value: value as SpotCategory, label})),
];

export type SortKey = 'distance' | 'latest';

type Props = {
  category: SpotCategory | '';
  onCategoryChange: (category: SpotCategory | '') => void;
  region: string;
  onRegionChange: (region: string) => void;
  sort: SortKey;
  onSortChange: (sort: SortKey) => void;
  onFindNearby: () => void;
  locating: boolean;
  hasLocation: boolean;
  mobileView: 'list' | 'map';
  onMobileViewChange: (view: 'list' | 'map') => void;
};

// 상단 툴바: 카테고리(전체/와인딩/심레이싱), 지역, 거리순/최신순, 내 주변 찾기, 모바일 목록/지도 전환.
export default function SpotsFilters({
  category,
  onCategoryChange,
  region,
  onRegionChange,
  sort,
  onSortChange,
  onFindNearby,
  locating,
  hasLocation,
  mobileView,
  onMobileViewChange,
}: Props) {
  return (
    <div className={styles.toolbar}>
      <div className={styles.filterGroup}>
        <div className={styles.chips} role="group" aria-label="카테고리 선택">
          {CATEGORIES.map((c) => (
            <button key={c.value || 'all'} type="button" aria-pressed={category === c.value} onClick={() => onCategoryChange(c.value)}>
              {c.label}
            </button>
          ))}
        </div>
        <select aria-label="지역 선택" value={region} onChange={(e) => onRegionChange(e.target.value)}>
          <option value="">전체 지역</option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <div className={styles.segment} role="group" aria-label="정렬 선택">
          <button type="button" aria-pressed={sort === 'distance'} onClick={() => onSortChange('distance')}>
            거리순
          </button>
          <button type="button" aria-pressed={sort === 'latest'} onClick={() => onSortChange('latest')}>
            최신순
          </button>
        </div>
      </div>

      <div className={styles.filterGroup}>
        <button type="button" className={styles.nearbyButton} onClick={onFindNearby} disabled={locating}>
          {locating ? '위치 확인 중…' : hasLocation ? '내 주변 다시 찾기' : '📍 내 주변 찾기'}
        </button>
        <div className={`${styles.segment} ${styles.mobileOnly}`} role="group" aria-label="목록·지도 전환">
          <button type="button" aria-pressed={mobileView === 'list'} onClick={() => onMobileViewChange('list')}>
            목록
          </button>
          <button type="button" aria-pressed={mobileView === 'map'} onClick={() => onMobileViewChange('map')}>
            지도
          </button>
        </div>
      </div>
    </div>
  );
}
