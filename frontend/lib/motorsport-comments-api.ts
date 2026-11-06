// 일정 댓글(board-service/src/motorsport-comments.js, Flyway V12). 브라우저 전용, 같은 출처 상대 경로.
// 읽기는 누구나, 쓰기·삭제·신고는 로그인 세션 쿠키가 필요하다.
import {ApiError} from './community-api';

export {ApiError};

export const COMMENT_MAX = 1000;

export type EventComment = {
  id: number;
  parentId: number | null;
  deleted: boolean;
  // 삭제된 댓글은 서버가 원문 대신 삭제 문구를 준다.
  content: string;
  // 탈퇴한 회원이면 null(공개 프로필 없음).
  authorId: number | null;
  username: string;
  authorWithdrawn: boolean;
  createdAt: string;
};

const BASE = '/api/board/motorsport';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {credentials: 'same-origin', cache: 'no-store', ...init});
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.message || `요청을 처리하지 못했습니다. (${res.status})`, res.status);
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(body),
});

export function fetchEventComments(eventId: number): Promise<EventComment[]> {
  return apiFetch(`${BASE}/events/${eventId}/comments`);
}

export function createEventComment(eventId: number, content: string, parentId: number | null): Promise<{id: number}> {
  return apiFetch(`${BASE}/events/${eventId}/comments`, json('POST', {content, parentId}));
}

// 작성자는 reason 없이, ADMIN이 다른 회원의 댓글을 지울 때는 reason 필수.
export function deleteEventComment(commentId: number, reason?: string): Promise<{ok: true}> {
  return apiFetch(`${BASE}/comments/${commentId}`, json('DELETE', reason ? {reason} : {}));
}

export function reportEventComment(commentId: number, reason: string): Promise<{id: number}> {
  return apiFetch(`${BASE}/comments/${commentId}/report`, json('POST', {reason}));
}
