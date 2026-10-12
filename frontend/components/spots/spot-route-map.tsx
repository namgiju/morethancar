'use client';

import {useEffect, useRef, useState} from 'react';
import {loadKakaoMaps, markerImageSrc, type KakaoMap} from '../../lib/kakao-maps';
import type {PublicSpot} from '../../lib/spots-types';
import styles from './spots.module.css';

// 상세 페이지의 작은 지도: 주 좌표 하나 + (와인딩이고 경로 데이터가 있으면) 경로선.
// 경로 데이터가 없는데 임의로 주행 경로를 그리지 않는다(지시 §4) — route가 없으면 점 하나만 찍는다.
export default function SpotRouteMap({spot, kakaoMapKey}: {spot: PublicSpot; kakaoMapKey: string}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(kakaoMapKey ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!kakaoMapKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(kakaoMapKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const kakao = window.kakao;
        const center = new kakao.maps.LatLng(spot.latitude, spot.longitude);
        const map: KakaoMap = new kakao.maps.Map(containerRef.current, {center, level: 6});

        if (spot.route && spot.route.length >= 2) {
          const path = spot.route.map((p) => new kakao.maps.LatLng(p.lat, p.lng));
          new kakao.maps.Polyline({path, strokeWeight: 4, strokeColor: '#4a7300', strokeOpacity: 0.85}).setMap(map);
          const bounds = new kakao.maps.LatLngBounds();
          path.forEach((point) => bounds.extend(point));
          map.setBounds(bounds);
        } else {
          new kakao.maps.Marker({
            position: center,
            map,
            image: new kakao.maps.MarkerImage(markerImageSrc(spot.category, true), new kakao.maps.Size(30, 30)),
          });
        }
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot.id]);

  if (status === 'unavailable') {
    return (
      <div className={styles.mapPlaceholder} role="status">
        <p>지도를 불러올 수 없어요. 주소: {spot.address}</p>
      </div>
    );
  }
  return (
    <div className={styles.mapWrap}>
      {status === 'loading' && <p className={styles.mapLoading}>지도를 불러오고 있어요…</p>}
      <div ref={containerRef} className={styles.detailMapCanvas} aria-label="스팟 위치 지도" />
    </div>
  );
}
