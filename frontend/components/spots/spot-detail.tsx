'use client';

import {useEffect, useState} from 'react';
import {ApiError, fetchSpot} from '../../lib/spots-api';
import {CATEGORY_LABELS, type PublicSpot} from '../../lib/spots-types';
import SpotRouteMap from './spot-route-map';
import styles from './spots.module.css';

// 공공도로를 쓰는 와인딩 코스 상세에 항상 보이는 고정 안내(지시 STEP 9 — 데이터로 관리하지 않는다).
const SAFETY_NOTICE = '공공도로입니다. 교통법규를 지키고 과속·위험 운전을 하지 마세요. 정차는 안전한 장소에서만 해주세요.';

export default function SpotDetail({id, kakaoMapKey}: {id: number; kakaoMapKey: string}) {
  const [spot, setSpot] = useState<PublicSpot | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchSpot(id)
      .then((data) => active && setSpot(data))
      .catch((err) => active && setError(err instanceof ApiError ? err.message : '스팟을 불러오지 못했어요.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div>
      <a href="/spots" className={styles.backLink}>
        ← 스팟 목록으로
      </a>
      {loading ? (
        <p className={styles.empty}>불러오는 중이에요.</p>
      ) : error || !spot ? (
        <p className={styles.empty}>{error || '스팟을 찾을 수 없어요.'}</p>
      ) : (
        <SpotDetailBody spot={spot} kakaoMapKey={kakaoMapKey} />
      )}
    </div>
  );
}

function SpotDetailBody({spot, kakaoMapKey}: {spot: PublicSpot; kakaoMapKey: string}) {
  return (
    <article className={styles.detailPanel}>
      <div className={styles.detailTags}>
        <span className={styles.tag}>{CATEGORY_LABELS[spot.category]}</span>
        {spot.region && <span className={styles.tag}>{spot.region}</span>}
      </div>

      <h1 className={styles.detailTitle}>{spot.name}</h1>

      {spot.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={styles.detailImage} src={spot.imageUrl} alt={spot.name} loading="lazy" />
      )}

      <SpotRouteMap spot={spot} kakaoMapKey={kakaoMapKey} />

      <dl className={styles.detailMeta}>
        <div>
          <dt>주소</dt>
          <dd>{spot.address}</dd>
        </div>
        {spot.category === 'WINDING' ? (
          <>
            <div>
              <dt>코스</dt>
              <dd>
                {spot.routeStart} → {spot.routeEnd}
              </dd>
            </div>
            {(spot.distanceKm != null || spot.durationMinutes != null) && (
              <div>
                <dt>거리·시간</dt>
                <dd>
                  {spot.distanceKm != null && `${spot.distanceKm}km`}
                  {spot.distanceKm != null && spot.durationMinutes != null && ' · '}
                  {spot.durationMinutes != null && `약 ${spot.durationMinutes}분`}
                </dd>
              </div>
            )}
            {spot.recommendedTime && (
              <div>
                <dt>추천 방문 시간</dt>
                <dd>{spot.recommendedTime}</dd>
              </div>
            )}
          </>
        ) : (
          <>
            {spot.businessHours && (
              <div>
                <dt>운영시간</dt>
                <dd>{spot.businessHours}</dd>
              </div>
            )}
            {spot.priceInfo && (
              <div>
                <dt>이용 요금</dt>
                <dd>{spot.priceInfo}</dd>
              </div>
            )}
            {spot.facilityInfo && (
              <div>
                <dt>시설 특징</dt>
                <dd>{spot.facilityInfo}</dd>
              </div>
            )}
          </>
        )}
      </dl>

      {spot.description && (
        <div className={styles.detailNote}>
          <h2>소개</h2>
          <p>{spot.description}</p>
        </div>
      )}

      {spot.category === 'WINDING' && (
        <p className={styles.detailStatusNote}>
          {SAFETY_NOTICE}
          {spot.caution && <> {spot.caution}</>}
        </p>
      )}

      {spot.category === 'SIM_RACING' && (spot.officialUrl || spot.reservationUrl) && (
        <div className={styles.detailLinks}>
          {spot.officialUrl && (
            <a className={styles.detailLink} href={spot.officialUrl} target="_blank" rel="noopener noreferrer">
              공식 홈페이지 ↗
            </a>
          )}
          {spot.reservationUrl && (
            <a className={styles.detailLink} href={spot.reservationUrl} target="_blank" rel="noopener noreferrer">
              예약하기 ↗
            </a>
          )}
        </div>
      )}
    </article>
  );
}
