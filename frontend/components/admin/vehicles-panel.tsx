'use client';

import {useCallback, useRef, useState} from 'react';
import {decideVehicleVerification, fetchVehicleVerifications, verificationDocumentUrl} from '../../lib/admin-api';
import type {VehicleVerification} from '../../lib/admin-types';
import {VERIFICATION_STATUS_LABELS} from '../../lib/admin-format';
import AdminList, {type AdminListHandle} from './admin-list';
import styles from './admin.module.css';

const CHIP_CLASS = {ok: styles.chipOk, pending: styles.chipPending, blocked: styles.chipBlocked} as const;

// 차량 인증 관리 — assignment-frontend/js/admin.js의
// renderVehicleVerifications()/decide() 포팅. 자동차등록증 원본은 이 화면과
// 신청 본인만 볼 수 있다(쿠키 인증 링크, fetch 없이 새 탭으로 연다).
// 목록은 다른 운영 목록과 같은 AdminList(검색 + 20건 페이지, 심사 중 먼저)로
// 과거 신청까지 넘겨 볼 수 있다. 목록 응답에는 서류 원본이 없다.
export default function VehiclesPanel({onAccessDenied}: {onAccessDenied: () => void}) {
  const listRef = useRef<AdminListHandle>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const load = useCallback((params: {q: string; page: number}) => fetchVehicleVerifications(params), []);

  async function decide(id: number, action: 'approve' | 'reject') {
    setBusyId(id);
    setError('');
    try {
      await decideVehicleVerification(id, action);
      listRef.current?.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className={styles.panel}>
      <h2>차량 인증 관리</h2>
      <p className={styles.empty}>실제 인증 신청 데이터입니다. 자동차등록증 원본은 이 화면(관리자)과 신청 본인만 볼 수 있습니다.</p>
      {error && <p className={styles.empty}>{error}</p>}
      <AdminList<VehicleVerification>
        ref={listRef}
        searchLabel="차량 인증 신청 검색"
        searchPlaceholder="사용자 / 차량번호 검색"
        load={load}
        getRowKey={(item) => item.id}
        onAccessDenied={onAccessDenied}
        emptyText="신청된 인증이 없어요."
        columns={[
          {header: '사용자', render: (item) => item.username},
          {header: '차량번호', render: (item) => item.licensePlate},
          {header: '제조사/모델', render: (item) => `${item.manufacturer} ${item.model}`},
          {header: '연식', render: (item) => item.modelYear},
          {header: '신청일', render: (item) => new Date(item.requestedAt).toLocaleDateString('ko-KR')},
          {
            header: '등록증',
            render: (item) => (
              <a className={styles.textLink} href={verificationDocumentUrl(item.id)} target="_blank" rel="noopener">
                이미지 보기
              </a>
            ),
          },
          {
            header: '상태',
            render: (item) => {
              const [chipText, chipKind] = VERIFICATION_STATUS_LABELS[item.status] || [item.status, 'pending'];
              return <span className={`${styles.chip} ${CHIP_CLASS[chipKind]}`}>{chipText}</span>;
            },
          },
          {
            header: '처리',
            render: (item) =>
              item.status === 'PENDING' ? (
                <>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, 'approve')}
                  >
                    승인
                  </button>{' '}
                  <button
                    type="button"
                    className={styles.dangerText}
                    disabled={busyId === item.id}
                    onClick={() => decide(item.id, 'reject')}
                  >
                    거절
                  </button>
                </>
              ) : (
                '-'
              ),
          },
        ]}
      />
    </section>
  );
}
