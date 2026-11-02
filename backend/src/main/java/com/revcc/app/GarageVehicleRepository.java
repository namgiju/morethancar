package com.revcc.app;

import org.springframework.data.jpa.repository.EntityGraph;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

/** 기존 JDBC VehicleRepository는 공용 카탈로그용으로 유지한다. */
public interface GarageVehicleRepository extends JpaRepository<Vehicle, Integer> {
    @EntityGraph(attributePaths = "user")
    List<Vehicle> findByUserIdOrderByIdDesc(Long userId);

    @Override
    @EntityGraph(attributePaths = "user")
    Optional<Vehicle> findById(Integer id);

    // 인증 상태·핵심 필드를 바꾸는 경로(차량 수정·인증 신청·관리자 승인/반려)는 이 행 잠금 안에서 최신 값을 읽고 쓴다.
    // 잠금 없이 읽은 엔티티를 저장하면 그사이 다른 경로가 바꾼 인증 상태를 통째로 덮어쓴다(Hibernate는 전체 컬럼을 UPDATE한다).
    // board의 PUT /garage/:id도 같은 행을 UPDATE하므로 이 잠금과 서로 기다린다. 이 메서드 전에 같은 차량을 영속성 컨텍스트에 올리지 않는다.
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select v from Vehicle v where v.id = :id")
    Optional<Vehicle> findByIdForUpdate(@Param("id") Integer id);
}
