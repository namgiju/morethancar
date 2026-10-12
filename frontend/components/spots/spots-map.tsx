'use client';

import {useEffect, useRef, useState} from 'react';
import {loadKakaoMaps, markerImageSrc, CURRENT_LOCATION_MARKER_SVG, type KakaoMap, type KakaoMarker} from '../../lib/kakao-maps';
import type {Bbox} from '../../lib/spots-api';
import type {Coordinates} from '../../lib/geolocation';
import type {PublicSpot} from '../../lib/spots-types';
import styles from './spots.module.css';

type Props = {
  spots: PublicSpot[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  userLocation: Coordinates | null;
  // 지도를 움직였을 때 보이는 영역만 다시 불러오기 위한 콜백(STEP 4). 디바운스는 호출하는 쪽(spots-browser)에서 한다.
  onBoundsChange?: (bbox: Bbox) => void;
  // 서버에서 런타임에 읽은 KAKAO_MAP_KEY(app/spots/page.tsx → spots-browser.tsx → 여기). 빈 문자열이면 지도 없이 목록만 쓴다.
  kakaoMapKey: string;
};

// 대한민국 전체가 대략 보이는 기본 중심·레벨.
const DEFAULT_CENTER = {lat: 36.2, lng: 127.9};
const DEFAULT_LEVEL = 13;

// /spots 지도 패널. 카카오맵 JS 키가 없으면(아직 발급 전) 목록은 그대로 쓸 수 있도록 안내만 보여준다
// (지도 로딩 실패가 목록 동작을 막지 않는다 — §4/§9 요구사항).
export default function SpotsMap({spots, selectedId, onSelect, userLocation, onBoundsChange, kakaoMapKey}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markersRef = useRef<KakaoMarker[]>([]);
  const locationMarkerRef = useRef<KakaoMarker | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(kakaoMapKey ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!kakaoMapKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(kakaoMapKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const kakao = window.kakao;
        const map = new kakao.maps.Map(containerRef.current, {
          center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: DEFAULT_LEVEL,
        });
        mapRef.current = map;
        setStatus('ready');
        if (onBoundsChange) {
          kakao.maps.event.addListener(map, 'idle', () => {
            const bounds = map.getBounds();
            const sw = bounds.getSouthWest();
            const ne = bounds.getNorthEast();
            onBoundsChange({swLat: sw.getLat(), swLng: sw.getLng(), neLat: ne.getLat(), neLng: ne.getLng()});
          });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 스팟 마커. 카테고리별 색, 선택된 스팟은 더 크게.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.kakao) return;
    const kakao = window.kakao;
    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = spots.map((spot) => {
      const selected = spot.id === selectedId;
      const size = selected ? 30 : 22;
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(spot.latitude, spot.longitude),
        map: mapRef.current!,
        image: new kakao.maps.MarkerImage(markerImageSrc(spot.category, selected), new kakao.maps.Size(size, size)),
        zIndex: selected ? 10 : 1,
      });
      kakao.maps.event.addListener(marker, 'click', () => onSelect(spot.id));
      return marker;
    });
  }, [spots, status, selectedId, onSelect]);

  // 선택된 스팟으로 지도 중심 이동.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || selectedId == null || !window.kakao) return;
    const spot = spots.find((s) => s.id === selectedId);
    if (!spot) return;
    mapRef.current.panTo(new window.kakao.maps.LatLng(spot.latitude, spot.longitude));
  }, [selectedId, spots, status]);

  // 현재 위치 마커("내 주변 찾기" 후). 위치 추적이 아니라 요청 시점 1회 좌표만 표시한다.
  useEffect(() => {
    if (status !== 'ready' || !mapRef.current || !window.kakao) return;
    locationMarkerRef.current?.setMap(null);
    locationMarkerRef.current = null;
    if (!userLocation) return;
    const kakao = window.kakao;
    const marker = new kakao.maps.Marker({
      position: new kakao.maps.LatLng(userLocation.latitude, userLocation.longitude),
      map: mapRef.current,
      image: new kakao.maps.MarkerImage(CURRENT_LOCATION_MARKER_SVG, new kakao.maps.Size(26, 26)),
      zIndex: 20,
    });
    locationMarkerRef.current = marker;
    mapRef.current.panTo(new kakao.maps.LatLng(userLocation.latitude, userLocation.longitude));
  }, [userLocation, status]);

  if (status === 'unavailable') {
    return (
      <div className={styles.mapPlaceholder} role="status">
        <p>지도를 불러올 수 없어요.</p>
        <p>아래 목록으로 스팟을 확인할 수 있어요.</p>
      </div>
    );
  }
  return (
    <div className={styles.mapWrap}>
      {status === 'loading' && <p className={styles.mapLoading}>지도를 불러오고 있어요…</p>}
      <div ref={containerRef} className={styles.mapCanvas} aria-label="스팟 지도" />
    </div>
  );
}
