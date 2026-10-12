// /admin/spots — types and client calls for board-service's
// /api/board/admin/spots (spots.js). MANAGER and ADMIN can use everything
// here except delete/restore (ADMIN only); the server checks the current DB
// role on every request. Mirrors lib/admin-motorsport.ts.
import {ApiError} from './community-api';
import type {Page} from './admin-types';
import type {RoutePoint, SpotCategory} from './spots-types';

export {ApiError};
export {CATEGORY_LABELS, REGIONS} from './spots-types';
export type {SpotCategory, RoutePoint} from './spots-types';

export type Publication = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export const PUBLICATION_LABELS: Record<Publication, string> = {DRAFT: '초안', PUBLISHED: '공개', HIDDEN: '비공개'};
export const LOG_ACTION_LABELS: Record<string, string> = {
  CREATE: '등록',
  UPDATE: '수정',
  PUBLISH: '공개',
  HIDE: '비공개',
  DELETE: '삭제',
  RESTORE: '복원',
};

export type AdminSpot = {
  id: number;
  category: SpotCategory;
  name: string;
  region: string | null;
  address: string;
  latitude: number;
  longitude: number;
  description: string | null;
  imageUrl: string | null;
  linkedPostCount: number;
  routeStart: string | null;
  routeEnd: string | null;
  distanceKm: number | null;
  durationMinutes: number | null;
  route: RoutePoint[] | null;
  recommendedTime: string | null;
  caution: string | null;
  businessHours: string | null;
  officialUrl: string | null;
  reservationUrl: string | null;
  facilityInfo: string | null;
  priceInfo: string | null;
  publication: Publication;
  publishedAt: string | null;
  createdBy: number;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy: number | null;
};

export type SpotInput = {
  category: SpotCategory;
  name: string;
  region: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  imageUrl: string;
  // WINDING
  routeStart: string;
  routeEnd: string;
  distanceKm: number | null;
  durationMinutes: number | null;
  route: RoutePoint[] | null;
  recommendedTime: string;
  caution: string;
  // SIM_RACING
  businessHours: string;
  officialUrl: string;
  reservationUrl: string;
  facilityInfo: string;
  priceInfo: string;
};

export type ContentLog = {
  id: number;
  entityType: 'SPOT';
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

const SP = '/api/board/admin/spots';

export function fetchAdminSpots(params: {
  q?: string;
  category?: SpotCategory | '';
  region?: string;
  publication?: Publication | '';
  deleted?: 'exclude' | 'include' | 'only';
  page?: number;
}): Promise<Page<AdminSpot>> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.region) query.set('region', params.region);
  if (params.publication) query.set('publication', params.publication);
  if (params.deleted && params.deleted !== 'exclude') query.set('deleted', params.deleted);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${SP}?${query}`);
}
export const createSpot = (input: SpotInput, publish: boolean) =>
  apiFetch<AdminSpot>(SP, send('POST', {...input, publish}));
export const updateSpot = (id: number, input: SpotInput) => apiFetch<AdminSpot>(`${SP}/${id}`, send('PUT', input));
export const setPublication = (id: number, action: 'publish' | 'hide', reason?: string) =>
  apiFetch<AdminSpot>(`${SP}/${id}/${action}`, send('POST', reason ? {reason} : {}));
export const deleteSpot = (id: number, reason?: string) => apiFetch<void>(`${SP}/${id}`, send('DELETE', reason ? {reason} : {}));
export const restoreSpot = (id: number, reason?: string) =>
  apiFetch<AdminSpot>(`${SP}/${id}/restore`, send('POST', reason ? {reason} : {}));

export function fetchContentLogs(params: {action?: string; page?: number}): Promise<Page<ContentLog>> {
  const query = new URLSearchParams();
  if (params.action) query.set('action', params.action);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${SP}/logs?${query}`);
}
