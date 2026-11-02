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
    @EntityGraph(attributePaths = {"vehicle", "vehicle.user"})
    List<VehicleVerification> findAllByOrderByIdDesc();

    @Override
    @EntityGraph(attributePaths = {"vehicle", "vehicle.user"})
    Optional<VehicleVerification> findById(Integer id);

    Optional<VehicleVerification> findFirstByVehicleIdOrderByIdDesc(Integer vehicleId);

    // 엔티티를 올리지 않고 차량 id만 읽는다. 관리자 승인/반려는 차량 → 신청 순서로 잠근다(인증 신청과 같은 순서).
    @Query("select v.vehicle.id from VehicleVerification v where v.id = :id")
    Optional<Integer> findVehicleIdById(@Param("id") Integer id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from VehicleVerification v where v.id = :id")
    Optional<VehicleVerification> findByIdForUpdate(@Param("id") Integer id);
}
