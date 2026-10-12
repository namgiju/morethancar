'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {usePathname, useRouter, useSearchParams} from 'next/navigation';
import {fetchSpots, type Bbox} from '../../lib/spots-api';
import {haversineKm, requestLocation, LOCATION_ERROR_MESSAGE, type Coordinates, type LocationError} from '../../lib/geolocation';
import type {PublicSpot, SpotCategory, SpotWithDistance} from '../../lib/spots-types';
import SpotsFilters, {type SortKey} from './spots-filters';
import SpotsList from './spots-list';
import SpotsMap from './spots-map';
import styles from './spots.module.css';

const isCategory = (value: string | null): value is SpotCategory => value === 'WINDING' || value === 'SIM_RACING';
const isSort = (value: string | null): value is SortKey => value === 'distance' || value === 'latest';

// 지도를 움직일 때마다 바로 다시 불러오면 과도한 요청이 생길 수 있어 디바운스한다.
const BBOX_DEBOUNCE_MS = 400;

// /spots — 지도·목록 중심 탐색(STEP 3·4·5). 기본 목록은 필터(카테고리·지역)에 맞는 공개 스팟
// 전체(최대 200개, board-service가 bbox 없이도 돌려주는 전체 목록)를 받아 브라우저에서 거리로
// 정렬한다. 지도를 움직이면 보이는 영역(bbox)만 추가로 불러와 목록에 합친다(지도·목록은 같은
// 데이터셋을 공유해 선택 상태가 항상 맞는다).
export default function SpotsBrowser({kakaoMapKey}: {kakaoMapKey: string}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [category, setCategory] = useState<SpotCategory | ''>(() => (isCategory(searchParams.get('category')) ? (searchParams.get('category') as SpotCategory) : ''));
  const [region, setRegion] = useState(() => searchParams.get('region') ?? '');
  const [sort, setSort] = useState<SortKey>(() => (isSort(searchParams.get('sort')) ? (searchParams.get('sort') as SortKey) : 'latest'));
  const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (category) params.set('category', category);
    if (region) params.set('region', region);
    if (sort !== 'latest') params.set('sort', sort);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, {scroll: false});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, region, sort]);

  const [userLocation, setUserLocation] = useState<Coordinates | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<LocationError['kind'] | null>(null);

  const findNearby = useCallback(() => {
    setLocating(true);
    setLocationError(null);
    requestLocation()
      .then((coords) => {
        setUserLocation(coords);
        setSort('distance');
      })
      .catch((err: LocationError) => setLocationError(err.kind))
      .finally(() => setLocating(false));
  }, []);

  function changeSort(next: SortKey) {
    setSort(next);
    if (next === 'distance' && !userLocation) findNearby();
  }

  const [baseSpots, setBaseSpots] = useState<PublicSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);

  useEffect(() => {
    const current = ++ticket.current;
    setLoading(true);
    setFailed(false);
    fetchSpots({category, region, limit: 200})
      .then(({spots}) => {
        if (current !== ticket.current) return;
        setBaseSpots(spots);
      })
      .catch(() => {
        if (current === ticket.current) setFailed(true);
      })
      .finally(() => {
        if (current === ticket.current) setLoading(false);
      });
  }, [category, region]);

  // 지도 이동 시 보이는 영역의 스팟을 추가로 받아 합친다(id 기준 중복 제거). 필터가 바뀌면
  // 기본 목록을 다시 받으니 합쳐둔 것도 함께 새로 시작한다.
  const [boundsSpots, setBoundsSpots] = useState<PublicSpot[]>([]);
  useEffect(() => setBoundsSpots([]), [category, region]);
  const bboxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleBoundsChange = useCallback(
    (bbox: Bbox) => {
      if (bboxTimer.current) clearTimeout(bboxTimer.current);
      bboxTimer.current = setTimeout(() => {
        fetchSpots({category, region, bbox, limit: 200})
          .then(({spots}) => setBoundsSpots(spots))
          .catch(() => {});
      }, BBOX_DEBOUNCE_MS);
    },
    [category, region],
  );

  const spots = useMemo(() => {
    const byId = new Map<number, PublicSpot>();
    for (const spot of baseSpots) byId.set(spot.id, spot);
    for (const spot of boundsSpots) byId.set(spot.id, spot);
    return [...byId.values()];
  }, [baseSpots, boundsSpots]);

  const sorted: SpotWithDistance[] = useMemo(() => {
    const withDistance = spots.map((spot) => ({
      ...spot,
      distanceFromMeKm: userLocation ? haversineKm(userLocation, spot) : null,
    }));
    if (sort === 'distance' && userLocation) {
      withDistance.sort((a, b) => (a.distanceFromMeKm ?? Infinity) - (b.distanceFromMeKm ?? Infinity));
    } else {
      withDistance.sort((a, b) => b.id - a.id); // 최신 등록순 근사(등록일시를 공개하지 않으므로 id 내림차순)
    }
    return withDistance;
  }, [spots, sort, userLocation]);

  return (
    <>
      <div className={styles.pageHead}>
        <h1>스팟</h1>
        <p>가까운 와인딩 코스와 심레이싱 시설을 지도와 목록으로 찾아보세요. 공공도로는 교통법규를 지키고 안전하게 이용해주세요.</p>
      </div>

      <SpotsFilters
        category={category}
        onCategoryChange={setCategory}
        region={region}
        onRegionChange={setRegion}
        sort={sort}
        onSortChange={changeSort}
        onFindNearby={findNearby}
        locating={locating}
        hasLocation={!!userLocation}
        mobileView={mobileView}
        onMobileViewChange={setMobileView}
      />

      {locationError && (
        <p className={styles.locationNotice} role="alert">
          {LOCATION_ERROR_MESSAGE[locationError]}
        </p>
      )}

      <div className={styles.browserLayout} data-mobile-view={mobileView}>
        <div className={styles.listPanel} aria-live="polite" aria-busy={loading}>
          {failed ? (
            <p className={styles.empty}>스팟을 불러오지 못했어요. 새로고침해주세요.</p>
          ) : loading && !sorted.length ? (
            <p className={styles.empty}>스팟을 불러오고 있어요.</p>
          ) : (
            <SpotsList spots={sorted} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
        <div className={styles.mapPanel}>
          <SpotsMap
            spots={sorted}
            selectedId={selectedId}
            onSelect={setSelectedId}
            userLocation={userLocation}
            onBoundsChange={handleBoundsChange}
            kakaoMapKey={kakaoMapKey}
          />
        </div>
      </div>
    </>
  );
}
