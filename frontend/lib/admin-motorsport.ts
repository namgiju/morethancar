// /admin/motorsport — types and client calls for board-service's
// /api/board/admin/motorsport (motorsport.js). MANAGER and ADMIN can use
// everything here except delete/restore (ADMIN only); the server checks the
// current DB role on every request, so the UI only mirrors that.
import {ApiError} from './community-api';
import type {Page} from './admin-types';

export {ApiError};

export type EventKind = 'RACE' | 'TRACK_DAY' | 'EVENT';
export type EventStatus = 'SCHEDULED' | 'TENTATIVE' | 'CHANGED' | 'CANCELLED';
export type Publication = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export type SeriesScope = 'DOMESTIC' | 'INTERNATIONAL';

export const KIND_LABELS: Record<EventKind, string> = {RACE: '경기', TRACK_DAY: '스포츠주행', EVENT: '행사'};
export const STATUS_LABELS: Record<EventStatus, string> = {
  SCHEDULED: '예정',
  TENTATIVE: '잠정',
  CHANGED: '변경됨',
  CANCELLED: '취소',
};
export const PUBLICATION_LABELS: Record<Publication, string> = {DRAFT: '초안', PUBLISHED: '공개', HIDDEN: '비공개'};
export const SCOPE_LABELS: Record<SeriesScope, string> = {DOMESTIC: '국내', INTERNATIONAL: '해외'};
export const LOG_ACTION_LABELS: Record<string, string> = {
  CREATE: '등록',
  UPDATE: '수정',
  PUBLISH: '공개',
  HIDE: '비공개',
  VERIFY: '확인일 갱신',
  DELETE: '삭제',
  RESTORE: '복원',
};
export const ENTITY_LABELS: Record<string, string> = {
  MOTORSPORT_EVENT: '일정',
  MOTORSPORT_SERIES: '시리즈',
  MOTORSPORT_VENUE: '장소',
};

export type MotorsportSeries = {
  id: number;
  code: string;
  name: string;
  scope: SeriesScope;
  officialUrl: string | null;
  active: boolean;
};

export type MotorsportVenue = {
  id: number;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  officialUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};

// Dates are venue-local YYYY-MM-DD; startsAt is a UTC ISO string or null.
export type AdminEvent = {
  id: number;
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  status: EventStatus;
  sourceUrl: string;
  sourceName: string;
  verifiedOn: string;
  note: string | null;
  series: {id: number; code: string; name: string; scope: SeriesScope} | null;
  venue: {id: number; name: string; country: string; region: string | null; timezone: string};
  linkedPostCount: number;
  publication: Publication;
  publishedAt: string | null;
  createdBy: number;
  updatedBy: number | null;
  verifiedBy: number;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy: number | null;
  bookingUrl: string | null;
  // 자동 수집 일정(board-service src/motorsport-import). 운영자가 등록한 일정은 모두 null/false.
  sourceKey: string | null;
  sourceCheckedAt: string | null;
  sourceSnapshot: SourceValues | null;
  sourceLatest: SourceValues | null;
  sourceReview: boolean;
};

// 수집기가 비교하는 출처 값. snapshot(마지막으로 반영·확인한 값)과 latest(마지막 수집 값)가 다르면 운영자 수정과
// 충돌해 반영하지 못한 출처 변경이 있다는 뜻이다.
export type SourceValues = Partial<Record<SourceField, string | number | null>>;
export type SourceField = 'title' | 'startsOn' | 'endsOn' | 'startsAt' | 'venueId' | 'status' | 'sourceUrl' | 'bookingUrl';
export const SOURCE_FIELD_LABELS: Record<SourceField, string> = {
  title: '제목',
  startsOn: '시작일',
  endsOn: '종료일',
  startsAt: '시작 시각',
  venueId: '장소',
  status: '상태',
  sourceUrl: '출처 주소',
  bookingUrl: '예약 링크',
};
export const SOURCE_LABELS: Record<string, string> = {
  f1: 'F1',
  nascar: 'NASCAR Cup',
  lemans: '르망 24시',
  superrace: '슈퍼레이스',
  inje: '인제 스피디움',
};
export type ImportRun = {
  source: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: {collected?: number; inserted?: number; updated?: number; conflict?: number; missing?: number; errors?: number} | null;
  error: string | null;
  lastSuccessAt: string | null;
};

export type EventInput = {
  seriesId: number | null;
  venueId: number;
  kind: EventKind;
  title: string;
  startsOn: string;
  endsOn: string;
  startsAt: string | null;
  status: EventStatus;
  sourceUrl: string;
  sourceName: string;
  verifiedOn: string;
  note: string;
};

export type SeriesInput = {code: string; name: string; scope: SeriesScope; officialUrl: string; active: boolean};
export type VenueInput = {
  name: string;
  country: string;
  region: string;
  timezone: string;
  officialUrl: string;
  latitude: number | null;
  longitude: number | null;
  active: boolean;
};

export type ContentLog = {
  id: number;
  entityType: 'MOTORSPORT_SERIES' | 'MOTORSPORT_VENUE' | 'MOTORSPORT_EVENT';
  entityId: number;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  actorId: number;
  actorRole: 'MANAGER' | 'ADMIN';
  actorUsername: string;
  createdAt: string;
};

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {credentials: 'same-origin', cache: 'no-store', ...init});
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `요청을 처리하지 못했습니다. (${res.status})`, res.status);
  return data as T;
}
const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(body),
});

const MS = '/api/board/admin/motorsport';

export function fetchAdminEvents(params: {
  q?: string;
  status?: EventStatus | '';
  publication?: Publication | '';
  deleted?: 'exclude' | 'include' | 'only';
  page?: number;
}): Promise<Page<AdminEvent>> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.status) query.set('status', params.status);
  if (params.publication) query.set('publication', params.publication);
  if (params.deleted && params.deleted !== 'exclude') query.set('deleted', params.deleted);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${MS}/events?${query}`);
}
export const createEvent = (input: EventInput, publish: boolean) =>
  apiFetch<AdminEvent>(`${MS}/events`, send('POST', {...input, publish}));
export const updateEvent = (id: number, input: EventInput) => apiFetch<AdminEvent>(`${MS}/events/${id}`, send('PUT', input));
export const setPublication = (id: number, action: 'publish' | 'hide', reason?: string) =>
  apiFetch<AdminEvent>(`${MS}/events/${id}/${action}`, send('POST', reason ? {reason} : {}));
export const verifyEvent = (id: number) => apiFetch<AdminEvent>(`${MS}/events/${id}/verify`, send('POST', {}));
export const deleteEvent = (id: number, reason?: string) => apiFetch<void>(`${MS}/events/${id}`, send('DELETE', reason ? {reason} : {}));
export const restoreEvent = (id: number, reason?: string) =>
  apiFetch<AdminEvent>(`${MS}/events/${id}/restore`, send('POST', reason ? {reason} : {}));
export const fetchStaleEvents = () => apiFetch<{today: string; events: AdminEvent[]; importRuns: ImportRun[]}>(`${MS}/stale`);

export const fetchSeries = () => apiFetch<MotorsportSeries[]>(`${MS}/series`);
export const saveSeries = (input: SeriesInput, id?: number) =>
  apiFetch<MotorsportSeries>(id ? `${MS}/series/${id}` : `${MS}/series`, send(id ? 'PUT' : 'POST', input));
export const fetchVenues = () => apiFetch<MotorsportVenue[]>(`${MS}/venues`);
export const saveVenue = (input: VenueInput, id?: number) =>
  apiFetch<MotorsportVenue>(id ? `${MS}/venues/${id}` : `${MS}/venues`, send(id ? 'PUT' : 'POST', input));

export function fetchContentLogs(params: {entityType?: string; action?: string; page?: number}): Promise<Page<ContentLog>> {
  const query = new URLSearchParams();
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.action) query.set('action', params.action);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${MS}/logs?${query}`);
}

// --- Venue-local time <-> absolute instant ---
// The form edits the start time as a wall-clock time at the venue (its IANA
// zone), and the API wants an ISO string with an offset. These convert
// between the two using Intl only (no date library).

function zoneOffsetMs(instant: number, zone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - instant;
}

// "2026-11-01T14:00" at Asia/Seoul → "2026-11-01T14:00:00+09:00".
export function venueLocalToIso(local: string, zone: string): string {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  // Two passes settle DST edges: the offset at the guessed instant, then at the corrected one.
  let instant = wall - zoneOffsetMs(wall, zone);
  instant = wall - zoneOffsetMs(instant, zone);
  const offset = Math.round(zoneOffsetMs(instant, zone) / 60000);
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date}T${pad(hh)}:${pad(mm)}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// UTC ISO → "YYYY-MM-DDTHH:mm" wall-clock at the venue (for datetime-local inputs).
export function isoToVenueLocal(iso: string, zone: string): string {
  const instant = Date.parse(iso);
  return new Date(instant + zoneOffsetMs(instant, zone)).toISOString().slice(0, 16);
}

export function formatInZone(iso: string, zone: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: zone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(iso));
}

export function kstToday(): string {
  return new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
}
