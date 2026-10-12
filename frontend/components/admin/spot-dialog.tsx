'use client';

import {useEffect, useRef, useState, type FormEvent} from 'react';
import {loadKakaoMaps, type KakaoMap, type KakaoMarker} from '../../lib/kakao-maps';
import {CATEGORY_LABELS, REGIONS} from '../../lib/spots-types';
import type {SpotCategory} from '../../lib/spots-types';
import {
  createSpot,
  PUBLICATION_LABELS,
  setPublication,
  updateSpot,
  type AdminSpot,
  type Publication,
  type SpotInput,
} from '../../lib/admin-spots';
import styles from './admin.module.css';

type Props = {
  spot: AdminSpot | null; // null = new spot
  onClose: () => void;
  onSaved: (message: string) => void;
  kakaoMapKey: string;
};

// 공개 상태 전환 규칙은 motorsport-event-dialog.tsx와 같다: DRAFT → PUBLISHED ↔ HIDDEN.
function publicationChoices(current: Publication | null): Publication[] {
  if (current === null || current === 'DRAFT') return ['DRAFT', 'PUBLISHED'];
  return ['PUBLISHED', 'HIDDEN'];
}

// 좌표 숫자 입력에 쓰는 보조 — "" 허용(빈 값일 때 undefined로).
const toNumber = (value: string): number | undefined => (value === '' ? undefined : Number(value));

export default function SpotDialog({spot, onClose, onSaved, kakaoMapKey}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [category, setCategory] = useState<SpotCategory>(spot?.category ?? 'WINDING');
  const [name, setName] = useState(spot?.name ?? '');
  const [region, setRegion] = useState(spot?.region ?? '');
  const [address, setAddress] = useState(spot?.address ?? '');
  const [latitude, setLatitude] = useState(spot ? String(spot.latitude) : '');
  const [longitude, setLongitude] = useState(spot ? String(spot.longitude) : '');
  const [description, setDescription] = useState(spot?.description ?? '');
  const [imageUrl, setImageUrl] = useState(spot?.imageUrl ?? '');

  const [routeStart, setRouteStart] = useState(spot?.routeStart ?? '');
  const [routeEnd, setRouteEnd] = useState(spot?.routeEnd ?? '');
  const [distanceKm, setDistanceKm] = useState(spot?.distanceKm != null ? String(spot.distanceKm) : '');
  const [durationMinutes, setDurationMinutes] = useState(spot?.durationMinutes != null ? String(spot.durationMinutes) : '');
  const [recommendedTime, setRecommendedTime] = useState(spot?.recommendedTime ?? '');
  const [caution, setCaution] = useState(spot?.caution ?? '');

  const [businessHours, setBusinessHours] = useState(spot?.businessHours ?? '');
  const [officialUrl, setOfficialUrl] = useState(spot?.officialUrl ?? '');
  const [reservationUrl, setReservationUrl] = useState(spot?.reservationUrl ?? '');
  const [facilityInfo, setFacilityInfo] = useState(spot?.facilityInfo ?? '');
  const [priceInfo, setPriceInfo] = useState(spot?.priceInfo ?? '');

  const [publication, setPublicationChoice] = useState<Publication>(spot?.publication ?? 'DRAFT');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const lat = toNumber(latitude);
    const lng = toNumber(longitude);
    if (lat === undefined || lng === undefined) return setError('좌표(위도·경도)를 입력해주세요.');
    const input: SpotInput = {
      category,
      name,
      region,
      address,
      latitude: lat,
      longitude: lng,
      description,
      imageUrl,
      routeStart,
      routeEnd,
      distanceKm: distanceKm === '' ? null : Number(distanceKm),
      durationMinutes: durationMinutes === '' ? null : Number(durationMinutes),
      route: null,
      recommendedTime,
      caution,
      businessHours,
      officialUrl,
      reservationUrl,
      facilityInfo,
      priceInfo,
    };
    setBusy(true);
    setError('');
    try {
      if (!spot) {
        await createSpot(input, publication === 'PUBLISHED');
        onSaved(publication === 'PUBLISHED' ? '스팟을 공개로 등록했어요.' : '스팟을 초안으로 저장했어요.');
      } else {
        await updateSpot(spot.id, input);
        if (publication !== spot.publication) {
          await setPublication(spot.id, publication === 'PUBLISHED' ? 'publish' : 'hide');
        }
        onSaved('스팟을 저장했어요.');
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했어요.');
      setBusy(false);
    }
  }

  const choices = publicationChoices(spot?.publication ?? null);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${styles.dialogWide}`}
      aria-labelledby="spot-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="spot-dialog-title">{spot ? '스팟 수정' : '스팟 등록'}</h2>
      <p>
        {spot
          ? `#${spot.id} · 변경 내용은 변경 이력에 남습니다.`
          : '좌표와 주소가 정확한지 확인한 뒤 등록해주세요. 초안은 공개 화면에 보이지 않습니다.'}
      </p>
      <form onSubmit={submit}>
        <fieldset disabled={busy} className={styles.plainFieldset}>
          <div className={styles.formGrid}>
            <label>
              <span>
                카테고리 <span className={styles.required}>*</span>
              </span>
              <select value={category} onChange={(e) => setCategory(e.target.value as SpotCategory)}>
                {(Object.keys(CATEGORY_LABELS) as SpotCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                장소명 <span className={styles.required}>*</span>
              </span>
              <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 미시령 옛길" />
            </label>
            <label>
              지역
              <select value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">선택 안 함</option>
                {REGIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.full}>
              <span>
                주소 <span className={styles.required}>*</span>
              </span>
              <input required maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="예: 강원도 고성군 토성면" />
            </label>
            <label>
              <span>
                위도 <span className={styles.required}>*</span>
              </span>
              <input type="number" step="0.000001" min={-90} max={90} required value={latitude} onChange={(e) => setLatitude(e.target.value)} />
            </label>
            <label>
              <span>
                경도 <span className={styles.required}>*</span>
              </span>
              <input type="number" step="0.000001" min={-180} max={180} required value={longitude} onChange={(e) => setLongitude(e.target.value)} />
            </label>
            <div className={styles.full}>
              <CoordinatePicker
                latitude={toNumber(latitude)}
                longitude={toNumber(longitude)}
                category={category}
                kakaoMapKey={kakaoMapKey}
                onPick={(lat, lng) => {
                  setLatitude(String(lat));
                  setLongitude(String(lng));
                }}
              />
            </div>
            <label className={styles.full}>
              대표 이미지 URL
              <input type="url" maxLength={500} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://" />
            </label>
            <label className={styles.full}>
              설명
              <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>

            {category === 'WINDING' ? (
              <>
                <p className={`${styles.fieldTitle} ${styles.full}`}>와인딩 코스 정보</p>
                <label>
                  <span>
                    코스 시작 위치 <span className={styles.required}>*</span>
                  </span>
                  <input required maxLength={100} value={routeStart} onChange={(e) => setRouteStart(e.target.value)} />
                </label>
                <label>
                  <span>
                    코스 종료 위치 <span className={styles.required}>*</span>
                  </span>
                  <input required maxLength={100} value={routeEnd} onChange={(e) => setRouteEnd(e.target.value)} />
                </label>
                <label>
                  코스 거리 (km)
                  <input type="number" step="0.1" min={0.1} value={distanceKm} onChange={(e) => setDistanceKm(e.target.value)} />
                </label>
                <label>
                  예상 주행 시간 (분)
                  <input type="number" step="1" min={1} value={durationMinutes} onChange={(e) => setDurationMinutes(e.target.value)} />
                </label>
                <label>
                  추천 방문 시간
                  <input maxLength={200} value={recommendedTime} onChange={(e) => setRecommendedTime(e.target.value)} placeholder="예: 가을 단풍철, 야간 운행 주의" />
                </label>
                <label className={styles.full}>
                  주의사항
                  <textarea rows={2} maxLength={500} value={caution} onChange={(e) => setCaution(e.target.value)} placeholder="예: 급커브·낙석 구간, 야간 통제 시간" />
                </label>
              </>
            ) : (
              <>
                <p className={`${styles.fieldTitle} ${styles.full}`}>심레이싱 시설 정보</p>
                <label className={styles.full}>
                  <span>
                    운영시간 <span className={styles.required}>*</span>
                  </span>
                  <input required maxLength={200} value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} placeholder="예: 매일 10:00-24:00" />
                </label>
                <label>
                  공식 홈페이지
                  <input type="url" maxLength={500} value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} placeholder="https://" />
                </label>
                <label>
                  예약 링크
                  <input type="url" maxLength={500} value={reservationUrl} onChange={(e) => setReservationUrl(e.target.value)} placeholder="https://" />
                </label>
                <label className={styles.full}>
                  시설 특징
                  <textarea rows={2} maxLength={500} value={facilityInfo} onChange={(e) => setFacilityInfo(e.target.value)} placeholder="예: 모터식 시뮬레이터 10대, VR 지원" />
                </label>
                <label className={styles.full}>
                  이용 요금 안내
                  <textarea rows={2} maxLength={500} value={priceInfo} onChange={(e) => setPriceInfo(e.target.value)} placeholder="예: 평일 30분 15,000원" />
                </label>
              </>
            )}
          </div>
          <span className={styles.srOnly} id="spot-publication-label">
            공개 상태
          </span>
          <p className={styles.fieldTitle}>공개 상태</p>
          <div className={styles.segmented} role="radiogroup" aria-labelledby="spot-publication-label">
            {choices.map((p) => (
              <label key={p}>
                <input type="radio" name="publication" value={p} checked={publication === p} onChange={() => setPublicationChoice(p)} />
                {PUBLICATION_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className={styles.dialogError} role="alert">
            {error}
          </p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogCancel} disabled={busy} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? '저장 중…' : !spot ? (publication === 'PUBLISHED' ? '저장 후 공개' : '초안 저장') : '저장'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

// 지도를 클릭해 좌표를 지정하는 보조 입력(STEP 7 item 7). 카카오맵 JS 키가 없으면 숫자 입력만
// 쓰도록 안내만 보여준다 — 키 발급·비용 확인 전까지 이 기능이 폼 자체를 막지 않는다.
function CoordinatePicker({
  latitude,
  longitude,
  category,
  kakaoMapKey,
  onPick,
}: {
  latitude: number | undefined;
  longitude: number | undefined;
  category: SpotCategory;
  kakaoMapKey: string;
  onPick: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const markerRef = useRef<KakaoMarker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>(kakaoMapKey ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!kakaoMapKey || !containerRef.current) return;
    let cancelled = false;
    loadKakaoMaps(kakaoMapKey)
      .then(() => {
        if (cancelled || !containerRef.current || !window.kakao) return;
        const kakao = window.kakao;
        const center = new kakao.maps.LatLng(latitude ?? 36.2, longitude ?? 127.9);
        const map = new kakao.maps.Map(containerRef.current, {center, level: latitude ? 6 : 13});
        mapRef.current = map;
        const marker = new kakao.maps.Marker({position: center, map});
        markerRef.current = marker;
        kakao.maps.event.addListener(map, 'click', (e: {latLng: {getLat: () => number; getLng: () => number}}) => {
          const lat = Math.round(e.latLng.getLat() * 1e6) / 1e6;
          const lng = Math.round(e.latLng.getLng() * 1e6) / 1e6;
          marker.setPosition(e.latLng);
          onPickRef.current(lat, lng);
        });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unavailable');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 숫자 입력으로 좌표가 바뀌면 지도 마커도 맞춰 옮긴다.
  useEffect(() => {
    if (status !== 'ready' || !window.kakao || latitude == null || longitude == null) return;
    const point = new window.kakao.maps.LatLng(latitude, longitude);
    markerRef.current?.setPosition(point);
    mapRef.current?.panTo(point);
  }, [latitude, longitude, status]);

  if (status === 'unavailable') {
    return <p className={styles.fieldHelp}>지도에서 좌표 선택: 카카오맵 키가 설정되면 이 자리에 지도가 나타나요. 지금은 위·경도를 직접 입력해주세요.</p>;
  }
  return (
    <div>
      <p className={styles.fieldHelp}>지도를 클릭해 좌표를 지정할 수 있어요{category === 'WINDING' ? ' (코스 시작 지점을 찍어주세요)' : ''}.</p>
      {status === 'loading' && <p className={styles.fieldHelp}>지도를 불러오고 있어요…</p>}
      <div ref={containerRef} style={{width: '100%', height: 220, borderRadius: 4, background: '#f6f7f4'}} />
    </div>
  );
}
