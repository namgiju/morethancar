package com.revcc.app;

import org.springframework.data.jpa.repository.EntityGraph;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface VehicleVerificationRepository extends JpaRepository<VehicleVerification, Integer> {
    /**
     * 관리자 인증 목록 한 페이지. 화면에 필요한 칸만 고르고 서류 원본(document_data)은 읽지 않는다 — 서류는
     * 개별 조회(GET /api/garage/vehicle-verifications/{id}/document)에서만 가져온다. 심사 중(PENDING)을 먼저,
     * 그다음 최근 신청 순. all=true면 전체, 아니면 pattern(아이디·차량번호 부분 일치, 소문자, %·_ 이스케이프는 호출자가 한다).
     * 오프셋 페이지라 넘겨 보는 사이 다른 관리자가 처리하거나 새 신청이 들어오면 행이 한 칸씩 밀릴 수 있다(다른 관리자 목록과 같다).
     */
    @Query(value = """
        select new com.revcc.app.AdminController$VerificationSummary(v.id, ve.id, u.username, ve.licensePlate,
            ve.manufacturer, ve.model, ve.modelYear, v.status, v.requestedAt)
        from VehicleVerification v join v.vehicle ve join ve.user u
        where :all = true or lower(u.username) like :pattern escape '\\' or lower(ve.licensePlate) like :pattern escape '\\'
        order by case when v.status = 'PENDING' then 0 else 1 end, v.id desc""",
        countQuery = """
        select count(v) from VehicleVerification v join v.vehicle ve join ve.user u
        where :all = true or lower(u.username) like :pattern escape '\\' or lower(ve.licensePlate) like :pattern escape '\\'""")
    org.springframework.data.domain.Page<AdminController.VerificationSummary> findSummaries(
        @Param("all") boolean all, @Param("pattern") String pattern, org.springframework.data.domain.Pageable pageable);

    @Override
    @EntityGraph(attributePaths = {"vehicle", "vehicle.user"})
    Optional<VehicleVerification> findById(Integer id);

    Optional<VehicleVerification> findFirstByVehicleIdOrderByIdDesc(Integer vehicleId);

    // 엔티티를 올리지 않고 차량 id만 읽는다. 관리자 승인/반려는 차량 → 신청 순서로 잠근다(인증 신청과 같은 순서).
    @Query("select v.vehicle.id from VehicleVerification v where v.id = :id")
    Optional<Integer> findVehicleIdById(@Param("id") Integer id);

    @Query("select max(v.id) from VehicleVerification v where v.vehicle.id = :vehicleId")
    Integer findLatestIdByVehicleId(@Param("vehicleId") Integer vehicleId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from VehicleVerification v where v.id = :id")
    Optional<VehicleVerification> findByIdForUpdate(@Param("id") Integer id);
}
