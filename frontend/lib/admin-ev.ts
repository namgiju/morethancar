// /admin/ev — types and client calls for board-service's /api/board/admin/ev
// (ev.js's evAdminRouter, STEP 7). MANAGER and ADMIN can use everything here
// except policy delete/restore (ADMIN only); the server re-checks the
// current DB role on every request. Mirrors lib/admin-spots.ts.
import {ApiError} from './community-api';
import type {Page} from './admin-types';
import type {EvCategory, EvRevisionKind, EvScope, EvStatus} from './ev-types';

export {ApiError};
export {CATEGORY_LABELS, SCOPE_LABELS, STATUS_LABELS} from './ev-format';
export type {EvCategory, EvRevisionKind, EvScope, EvStatus} from './ev-types';

export type Publication = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export const PUBLICATION_LABELS: Record<Publication, string> = {DRAFT: '초안', PUBLISHED: '공개', HIDDEN: '비공개'};
export type VerificationStatus = 'VERIFIED' | 'UNVERIFIED';
export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {VERIFIED: '검증 완료', UNVERIFIED: '미검증'};
export const REVISION_KIND_LABELS: Record<EvRevisionKind, string> = {INITIAL: '최초 등록', CHANGE: '정책 변경', CORRECTION: '오탈자 수정'};
export const LOG_ACTION_LABELS: Record<string, string> = {
  CREATE: '등록',
  UPDATE: '수정',
  PUBLISH: '공개',
  HIDE: '비공개',
  VERIFY: '확인',
  DELETE: '삭제',
  RESTORE: '복원',
  CANCEL: '취소',
  PROMOTE: '대표 지정',
};

export type AdminPolicySummary = {
  versionNo: number;
  status: EvStatus;
  publication: Publication;
  verificationStatus: VerificationStatus;
  lastVerifiedOn: string | null;
} | null;

export type AdminPolicy = {
  id: number;
  slug: string;
  title: string;
  category: EvCategory;
  scope: EvScope;
  regionNote: string | null;
  featured: boolean;
  publication: Publication;
  publishedAt: string | null;
  createdBy: number;
  updatedBy: number | null;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
  deletedBy: number | null;
  versionCount: number;
  currentVersion: AdminPolicySummary;
};

export type PolicyBasicInput = {
  category: EvCategory;
  scope: EvScope;
  regionNote: string;
  title: string;
  featured: boolean;
  expectedUpdatedAt?: string | null;
};

export type AdminSource = {
  id: number;
  policyVersionId: number;
  publisher: string;
  title: string;
  url: string;
  checkedOn: string;
  checkedBy: number;
  createdAt: string;
};
export type NewSourceInput = {publisher: string; title: string; url: string; checkedOn?: string};

export type AdminVersion = {
  id: number;
  policyId: number;
  versionNo: number;
  revisionKind: EvRevisionKind;
  supersedesVersionId: number | null;
  summary: string;
  keyPoints: string;
  target: string;
  benefit: string;
  howToApply: string;
  note: string | null;
  status: EvStatus;
  changeConfirmed: boolean;
  announcedOn: string | null;
  effectiveDate: string | null;
  endDate: string | null;
  endDateIndefinite: boolean;
  verificationStatus: VerificationStatus;
  lastVerifiedOn: string | null;
  verifiedBy: number | null;
  publication: Publication;
  publishedAt: string | null;
  isCurrent: boolean;
  cancelledAt: string | null;
  cancellationNote: string | null;
  changeSummary: string | null;
  createdBy: number;
  createdAt: string;
  updatedBy: number | null;
  updatedAt: string | null;
  sources: AdminSource[];
};

// 버전 등록·수정 공용 입력. confirmVerification은 사용자가 실제로 체크한 값만 보낸다 — status나
// 날짜 입력으로 서버가 추론하지 않는다(board-service/src/ev.js의 versionContentInput, STEP 7
// 사후 검토에서 발견한 결함 수정). confirmVerification이 true면 같은 요청의 `sources`(새 출처)나
// 이미 저장된 출처가 1개 이상 있어야 한다 — 검증 의사만 있고 근거가 없는 저장은 서버가 거부한다.
// expectedUpdatedAt은 동시 편집 충돌 감지용(수정에만 쓴다).
export type VersionContentInput = {
  summary: string;
  keyPoints: string;
  target: string;
  benefit: string;
  howToApply: string;
  note: string;
  status: EvStatus;
  announcedOn: string;
  effectiveDate: string;
  endDate: string;
  endDateIndefinite: boolean;
  confirmVerification: boolean;
  verifiedOn?: string;
};
export type NewVersionInput = VersionContentInput & {
  revisionKind: 'CHANGE' | 'CORRECTION';
  supersedesVersionId: number;
  changeSummary: string;
  sources?: NewSourceInput[];
};
export type UpdateVersionInput = VersionContentInput & {
  changeSummary?: string;
  expectedUpdatedAt?: string | null;
  sources?: NewSourceInput[];
};

export type ContentLog = {
  id: number;
  entityType: 'POLICY' | 'POLICY_VERSION';
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

export type StaleVersion = {policyId: number; slug: string; title: string; id: number; versionNo: number; status: EvStatus; lastVerifiedOn: string | null};

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

const EV = '/api/board/admin/ev';

export function fetchAdminPolicies(params: {
  q?: string;
  category?: EvCategory | '';
  deleted?: 'exclude' | 'include' | 'only';
  page?: number;
}): Promise<Page<AdminPolicy>> {
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q);
  if (params.category) query.set('category', params.category);
  if (params.deleted && params.deleted !== 'exclude') query.set('deleted', params.deleted);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${EV}/policies?${query}`);
}
export const fetchAdminPolicy = (id: number) => apiFetch<AdminPolicy>(`${EV}/policies/${id}`);
export const fetchAdminVersions = (policyId: number) => apiFetch<{versions: AdminVersion[]}>(`${EV}/policies/${policyId}/versions`);

export const createPolicy = (input: {slug: string} & PolicyBasicInput & VersionContentInput & {sources?: NewSourceInput[]}) =>
  apiFetch<AdminPolicy>(`${EV}/policies`, send('POST', input));
export const updatePolicy = (id: number, input: PolicyBasicInput) => apiFetch<AdminPolicy>(`${EV}/policies/${id}`, send('PUT', input));
export const setPolicyPublication = (id: number, action: 'publish' | 'hide', reason?: string) =>
  apiFetch<AdminPolicy>(`${EV}/policies/${id}/${action}`, send('POST', reason ? {reason} : {}));
export const deletePolicy = (id: number, reason?: string) => apiFetch<void>(`${EV}/policies/${id}`, send('DELETE', reason ? {reason} : {}));
export const restorePolicy = (id: number, reason?: string) =>
  apiFetch<AdminPolicy>(`${EV}/policies/${id}/restore`, send('POST', reason ? {reason} : {}));

export const createVersion = (policyId: number, input: NewVersionInput) =>
  apiFetch<AdminVersion>(`${EV}/policies/${policyId}/versions`, send('POST', input));
export const updateVersion = (id: number, input: UpdateVersionInput) => apiFetch<AdminVersion>(`${EV}/versions/${id}`, send('PUT', input));
export const addSource = (versionId: number, input: NewSourceInput) => apiFetch<AdminVersion>(`${EV}/versions/${versionId}/sources`, send('POST', input));
export const setVersionPublication = (id: number, action: 'publish' | 'hide') => apiFetch<AdminVersion>(`${EV}/versions/${id}/${action}`, send('POST', {}));
export const verifyVersion = (id: number) => apiFetch<AdminVersion>(`${EV}/versions/${id}/verify`, send('POST', {}));
export const verifyConfirmVersion = (id: number) => apiFetch<AdminVersion>(`${EV}/versions/${id}/verify-confirm`, send('POST', {}));
export const promoteVersion = (id: number) => apiFetch<AdminVersion>(`${EV}/versions/${id}/promote`, send('POST', {}));
export const cancelVersion = (id: number, cancellationNote: string) => apiFetch<AdminVersion>(`${EV}/versions/${id}/cancel`, send('POST', {cancellationNote}));

export function fetchContentLogs(params: {entityType?: 'POLICY' | 'POLICY_VERSION' | ''; action?: string; page?: number}): Promise<Page<ContentLog>> {
  const query = new URLSearchParams();
  if (params.entityType) query.set('entityType', params.entityType);
  if (params.action) query.set('action', params.action);
  query.set('page', String(params.page ?? 1));
  return apiFetch(`${EV}/logs?${query}`);
}
export function fetchStaleVersions(olderThan?: number): Promise<{today: string; olderThan: number; versions: StaleVersion[]}> {
  const query = new URLSearchParams();
  if (olderThan) query.set('olderThan', String(olderThan));
  return apiFetch(`${EV}/stale?${query}`);
}
