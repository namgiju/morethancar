'use client';

import {useEffect, useState} from 'react';
import {ApiError, fetchPublicVehicle} from '../../lib/community-api';
import type {PublicVehicle, VehiclePart} from '../../lib/community-types';
import {imageUrl, partPeriodLabel, postUrl} from '../../lib/format';
import {kstToday} from '../../lib/motorsport';
import CommunityPage, {useNotice} from './community-page';
import MemberLink from './member-link';
import {useCommunitySession} from './use-community-session';
import styles from './post-detail.module.css';

const RECORD_LABELS: Record<string, string> = {maintenance: '정비', tuning: '튜닝', parts: '부품'};

type State =
  | {status: 'loading'}
  | {status: 'not-found'; message: string}
  | {status: 'error'}
  | {status: 'ready'; vehicle: PublicVehicle};

// Public vehicle page (/community/cars/:id), formerly the #car-{id} dialog.
// Editing the vehicle, records and parts belongs to the personal garage
// (/home) — the owner gets a link there.
export default function VehiclePublic({vehicleId}: {vehicleId: number}) {
  const auth = useCommunitySession();
  const {session} = auth;
  const {notice} = useNotice();
  const [state, setState] = useState<State>({status: 'loading'});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({status: 'loading'});
    fetchPublicVehicle(vehicleId)
      .then((vehicle) => !cancelled && setState({status: 'ready', vehicle}))
      .catch((error) => {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 404) setState({status: 'not-found', message: error.message});
        else setState({status: 'error'});
      });
    return () => {
      cancelled = true;
    };
  }, [vehicleId, reloadKey]);

  return (
    <CommunityPage auth={auth} notice={notice}>
      {state.status === 'loading' && <p className={styles.emptyComments}>차고를 불러오고 있어요.</p>}
      {state.status === 'not-found' && (
        <p className={styles.emptyComments}>
          {state.message} <a href="/community">목록으로 돌아가기</a>
        </p>
      )}
      {state.status === 'error' && (
        <p className={styles.emptyComments}>
          차고를 불러오지 못했어요.{' '}
          <button type="button" className={styles.textButton} onClick={() => setReloadKey((k) => k + 1)}>
            다시 시도
          </button>
        </p>
      )}
      {state.status === 'ready' && <VehicleBody vehicle={state.vehicle} own={session?.id === state.vehicle.ownerId} />}
    </CommunityPage>
  );
}

// Header (인증 차량 / 등록 차량 / 이전 보유 차량) → current parts → timeline
// (registration, records, part install/removal and linked posts merged by date
// on the client — there is no timeline API) → past parts. Ownership and part
// evidence ("사진 첨부" / "사용자 입력") are shown separately. Cost and the
// review status come only to the owner (server-side); the plate never does.
function VehicleBody({vehicle: v, own}: {vehicle: PublicVehicle; own: boolean}) {
  const parts = v.parts ?? [];
  const posts = v.posts ?? [];
  const current = parts.filter((p) => !p.removedOn);
  const past = parts.filter((p) => p.removedOn);
  const today = kstToday();
  const status = v.archivedAt ? '이전 보유 차량' : v.verified ? '인증 차량' : '등록 차량';
  const timeline = [
    ...(v.createdAt ? [{key: 'reg', date: kstDate(v.createdAt), rank: 0, label: '차고 등록', title: v.model, href: null as string | null}] : []),
    ...v.records.map((r) => ({key: `r${r.id}`, date: r.date, rank: 2, label: RECORD_LABELS[r.kind] || r.kind, title: r.title, href: null})),
    ...parts.flatMap((p) => [
      {key: `pi${p.id}`, date: p.installedOn, rank: 1, label: '부품 장착', title: `${p.brand} ${p.name}`, href: null},
      ...(p.removedOn ? [{key: `po${p.id}`, date: p.removedOn, rank: 3, label: '부품 탈거', title: `${p.brand} ${p.name}`, href: null}] : []),
    ]),
    ...posts.map((p) => ({key: `g${p.id}`, date: kstDate(p.createdAt), rank: 4, label: '글', title: p.title, href: postUrl(p)})),
    // Newest first; within a day, the later kind of event first (registration < install < record < removal < post).
  ].sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : b.rank - a.rank));

  function partCard(part: VehiclePart) {
    const reviews = posts.filter((p) => p.partId === part.id);
    return (
      <div key={part.id} className={styles.comment}>
        <small className={styles.muted}>{partPeriodLabel(part, today)}</small>
        <h4 className={styles.recordTitle}>
          {part.brand} {part.name}
        </h4>
        {part.spec && <p>{part.spec}</p>}
        {reviews.map((p) => (
          <a key={p.id} className={styles.boardLink} href={postUrl(p)}>
            후기: {p.title} →
          </a>
        ))}
        {own && (
          <a className={styles.boardLink} href={`/community/new?category=parts&vehicleId=${v.id}&partId=${part.id}`}>
            후기 쓰기 →
          </a>
        )}
      </div>
    );
  }

  return (
    <>
      <span className={styles.category}>OWNER’S GARAGE · {status}</span>
      <h1 className={styles.title}>{v.model}</h1>
      <div className={styles.meta}>
        <MemberLink id={v.ownerId} name={v.username} />
        <span>
          {v.year}년 · {v.trim || '오너 차량'}
        </span>
      </div>
      {v.imageId && (
        <div className={styles.gallery}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl(v.imageId)} alt={v.model} />
        </div>
      )}
      <p className={styles.text}>{v.bio || '차량 소개를 기다리고 있어요.'}</p>
      {own && (
        <a className={styles.boardLink} href="/home">
          내 차고에서 차량·기록 관리 →
        </a>
      )}
      <section className={styles.comments} aria-labelledby="current-parts-title">
        <h3 id="current-parts-title">현재 장착 부품 {current.length}</h3>
        {!current.length && <p className={styles.emptyComments}>장착 중인 부품 기록이 없어요.</p>}
        {current.map(partCard)}
      </section>
      <section className={styles.comments} aria-labelledby="timeline-title">
        <h3 id="timeline-title">타임라인 {timeline.length}</h3>
        {!timeline.length && <p className={styles.emptyComments}>아직 기록이 없어요. 첫 정비나 장착 경험을 남겨보세요.</p>}
        {timeline.map((item) => (
          <div key={item.key} className={styles.comment}>
            <small className={styles.muted}>
              {item.date} · {item.label}
            </small>
            {item.href ? (
              <a className={styles.recordTitle} href={item.href}>
                {item.title}
              </a>
            ) : (
              <h4 className={styles.recordTitle}>{item.title}</h4>
            )}
          </div>
        ))}
      </section>
      <section className={styles.comments} aria-labelledby="records-title">
        <h3 id="records-title">정비 · 튜닝 · 부품 기록 {v.records.length}</h3>
        {v.records.map((r) => {
          const facts = [r.mileage !== null ? `${r.mileage.toLocaleString()} km` : '', r.cost != null ? `${r.cost.toLocaleString()}원` : '']
            .filter(Boolean)
            .join(' · ');
          return (
            <div key={r.id} className={styles.comment}>
              <small className={styles.muted}>
                {r.date} · {RECORD_LABELS[r.kind] || r.kind}
              </small>
              <h4 className={styles.recordTitle}>{r.title}</h4>
              {r.content && <p>{r.content}</p>}
              {facts && <small className={styles.muted}>{facts}</small>}
            </div>
          );
        })}
      </section>
      {past.length > 0 && (
        <section className={styles.comments} aria-labelledby="past-parts-title">
          <h3 id="past-parts-title">과거 부품 {past.length}</h3>
          {past.map(partCard)}
        </section>
      )}
    </>
  );
}

// Timestamps (registration, posts) as KST calendar dates, to sort with plain dates.
function kstDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', {timeZone: 'Asia/Seoul'});
}
