'use client';

import {useCallback, useEffect, useState, type FormEvent} from 'react';
import {ApiError, changeMemberRole, fetchMembers, fetchOperators, fetchRoleHistory} from '../../lib/admin-api';
import type {AdminMember, MemberRole, RoleHistoryEntry} from '../../lib/admin-types';
import {adminDate, MEMBER_STATUS_LABELS} from '../../lib/admin-format';
import AdminShell, {AdminHeading} from './admin-shell';
import AdminConfirmDialog, {type ConfirmSpec} from './admin-confirm-dialog';
import styles from './admin.module.css';

const ROLE_LABELS: Record<MemberRole, string> = {USER: '일반 회원 (USER)', MANAGER: '콘텐츠 운영자 (MANAGER)', ADMIN: '관리자 (ADMIN)'};
const ROLE_CHIP: Record<MemberRole, string> = {USER: styles.chipNeutral, MANAGER: styles.chipOk, ADMIN: styles.chipDark};

// `ROLE:USER>MANAGER:사유` (role API) or `UPDATE:...ROLE(USER>MANAGER)...` (member edit).
function describe(action: string): {from: string; to: string; reason: string} {
  const role = /^ROLE:([A-Z]+)>([A-Z]+):?(.*)$/.exec(action);
  if (role) return {from: role[1], to: role[2], reason: role[3]};
  const update = /ROLE\(([A-Z]+)>([A-Z]+)\)/.exec(action);
  return update ? {from: update[1], to: update[2], reason: '회원 관리에서 변경'} : {from: '', to: '', reason: action};
}

// /admin/users — ADMIN only. Grants and revokes operator roles through the
// Spring role API (last-admin and self-change protection, session reset,
// audit record — all enforced on the server).
export default function OperatorsAdmin() {
  return (
    <AdminShell active="users" require="ADMIN">
      {({session, onAccessDenied}) => <Operators selfId={session.id} onAccessDenied={onAccessDenied} />}
    </AdminShell>
  );
}

function Operators({selfId, onAccessDenied}: {selfId: number; onAccessDenied: () => void}) {
  const [operators, setOperators] = useState<AdminMember[] | null>(null);
  const [history, setHistory] = useState<RoleHistoryEntry[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [target, setTarget] = useState<AdminMember | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleError = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) onAccessDenied();
      else setError(e instanceof Error ? e.message : '불러오지 못했어요.');
    },
    [onAccessDenied],
  );

  useEffect(() => {
    Promise.all([fetchOperators(), fetchRoleHistory()])
      .then(([o, h]) => {
        setOperators(o);
        setHistory(h);
      })
      .catch(handleError);
  }, [reloadKey, handleError]);

  return (
    <>
      <AdminHeading
        eyebrow="ACCOUNTS"
        title="운영자 권한"
        description="콘텐츠 운영자(MANAGER)를 지정·해제합니다. 권한이 바뀐 계정은 모든 기기에서 로그아웃되고, 다시 로그인하면 새 권한이 적용됩니다."
      />
      <p className={styles.notice} role="status" aria-live="polite">{notice}</p>
      {error && <p className={styles.errorText}>{error}</p>}

      <section className={styles.panel} aria-labelledby="operators-title">
        <h2 id="operators-title">현재 운영자</h2>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>아이디</th>
                <th>권한</th>
                <th>계정 상태</th>
                <th>가입일</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {!operators ? (
                <tr><td colSpan={5}>불러오는 중…</td></tr>
              ) : operators.length === 0 ? (
                <tr><td colSpan={5}>운영자가 없어요.</td></tr>
              ) : (
                operators.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className={styles.rowTitle}>{m.username}{m.id === selfId ? ' (나)' : ''}</span>
                      <span className={styles.rowSub}>#{m.id}{m.email ? ` · ${m.email}` : ''}</span>
                    </td>
                    <td><span className={`${styles.chip} ${ROLE_CHIP[m.role]}`}>{m.role}</span></td>
                    <td>{MEMBER_STATUS_LABELS[m.status] ?? m.status}</td>
                    <td>{adminDate(m.joinedAt)}</td>
                    <td>
                      {m.id === selfId ? (
                        <span className={styles.rowSub}>자기 자신은 변경할 수 없어요</span>
                      ) : (
                        <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => setTarget(m)}>권한 변경</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <MemberSearch selfId={selfId} onSelect={setTarget} onError={handleError} />

      <section className={styles.panel} aria-labelledby="role-history-title">
        <h2 id="role-history-title">권한 변경 기록</h2>
        <p className={styles.count}>최근 50건 · 누가 누구의 권한을 언제 무엇으로 바꿨는지</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>시각</th>
                <th>대상</th>
                <th>변경</th>
                <th>수행자</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {!history ? (
                <tr><td colSpan={5}>불러오는 중…</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={5}>권한 변경 기록이 없어요.</td></tr>
              ) : (
                history.map((h) => {
                  const d = describe(h.action);
                  return (
                    <tr key={h.id}>
                      <td>{adminDate(h.createdAt)}</td>
                      <td>{h.username ?? `#${h.userId}`}</td>
                      <td>{d.from ? <>{d.from} → <strong>{d.to}</strong></> : '—'}</td>
                      <td>{h.adminUsername ?? (h.adminId ? `#${h.adminId}` : '—')}</td>
                      <td className={styles.detailText}>{d.reason || '—'}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {target && (
        <RoleDialog
          member={target}
          onClose={() => setTarget(null)}
          onChanged={(message) => {
            setNotice(message);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}

function MemberSearch({selfId, onSelect, onError}: {selfId: number; onSelect: (m: AdminMember) => void; onError: (e: unknown) => void}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<AdminMember[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResults((await fetchMembers({q: q.trim(), field: 'username', page: 1})).items);
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="member-search-title">
      <h2 id="member-search-title">회원 검색 · 운영자 지정</h2>
      <form className={styles.filters} role="search" onSubmit={submit}>
        <input aria-label="아이디 검색" placeholder="아이디로 검색" maxLength={100} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className={styles.dark} disabled={busy}>{busy ? '검색 중…' : '검색'}</button>
      </form>
      {results && (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>아이디</th>
                <th>권한</th>
                <th>계정 상태</th>
                <th>작업</th>
              </tr>
            </thead>
            <tbody>
              {results.length === 0 ? (
                <tr><td colSpan={4}>검색 결과가 없어요.</td></tr>
              ) : (
                results.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className={styles.rowTitle}>{m.username}</span>
                      <span className={styles.rowSub}>#{m.id}</span>
                    </td>
                    <td><span className={`${styles.chip} ${ROLE_CHIP[m.role]}`}>{m.role}</span></td>
                    <td>{MEMBER_STATUS_LABELS[m.status] ?? m.status}</td>
                    <td>
                      {m.id === selfId ? (
                        <span className={styles.rowSub}>본인</span>
                      ) : (
                        <button type="button" className={`${styles.secondary} ${styles.small}`} onClick={() => onSelect(m)}>선택</button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Two steps: pick the new role and a reason, then confirm the summary.
function RoleDialog({member, onClose, onChanged}: {member: AdminMember; onClose: () => void; onChanged: (message: string) => void}) {
  const [role, setRole] = useState<MemberRole>(member.role === 'USER' ? 'MANAGER' : 'USER');
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const choices: MemberRole[] = ['USER', 'MANAGER', 'ADMIN'];

  if (confirm) return <AdminConfirmDialog spec={confirm} onClose={onClose} onDone={() => {}} />;

  return (
    <AdminConfirmDialog
      spec={{
        title: '권한 변경',
        message: (
          <>
            <strong>{member.username}</strong> · 현재 {ROLE_LABELS[member.role]}
            <div className={styles.segmented} role="radiogroup" aria-label="새 권한">
              {choices.map((r) => (
                <label key={r}>
                  <input type="radio" name="new-role" checked={role === r} disabled={r === member.role} onChange={() => setRole(r)} />
                  {r}
                </label>
              ))}
            </div>
            {role === 'ADMIN' && <span className={styles.rowSub}>ADMIN은 회원 제재·신고 처리·운영자 지정 등 모든 관리 권한을 가집니다.</span>}
            {role === 'MANAGER' && <span className={styles.rowSub}>MANAGER는 모터스포츠 일정 등 콘텐츠만 관리할 수 있어요.</span>}
          </>
        ),
        confirmLabel: '다음',
        reason: 'required',
        reasonLabel: '변경 사유',
        // First step only validates and moves to the confirmation summary.
        onConfirm: async (reason) => {
          if (role === member.role) throw new Error('다른 권한을 선택해주세요.');
          setConfirm({
            title: '권한 변경 확인',
            message: (
              <>
                <strong>{member.username}</strong>의 권한을 <strong>{member.role} → {role}</strong>로 변경합니다.
                <span className={styles.rowSub}>사유: {reason}</span>
                <span className={styles.rowSub}>이 회원은 모든 기기에서 로그아웃됩니다.</span>
              </>
            ),
            confirmLabel: '변경',
            danger: role === 'USER' || member.role === 'ADMIN',
            onConfirm: async () => {
              await changeMemberRole(member.id, role, reason);
              onChanged(`${member.username}의 권한을 ${role}(으)로 변경했어요.`);
            },
          });
          throw new StepDone();
        },
      }}
      onClose={onClose}
      onDone={() => {}}
    />
  );
}

// Thrown by the first step so its dialog stays mounted until the second
// step replaces it (AdminConfirmDialog closes itself only on success).
class StepDone extends Error {
  constructor() {
    super('');
  }
}
