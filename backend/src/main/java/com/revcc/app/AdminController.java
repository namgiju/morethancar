package com.revcc.app;

import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/** 관리자 전용 API. 화면에서 메뉴를 숨기는 것과 별개로 role을 서버에서 다시 검증한다. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final SharedSessionService sessions;
    private final UserRepository users;
    private final GarageVehicleRepository vehicles;
    private final VehicleVerificationRepository verifications;

    public AdminController(SharedSessionService sessions, UserRepository users, GarageVehicleRepository vehicles,
            VehicleVerificationRepository verifications) {
        this.sessions = sessions;
        this.users = users;
        this.vehicles = vehicles;
        this.verifications = verifications;
    }

    // 회원·차량 집계와 인증 관리는 Spring, 게시글·신고 운영 조회는 board-service가 담당한다.
    @GetMapping("/overview")
    public Map<String, Object> overview(
            @CookieValue(name = SharedSessionService.COOKIE, required = false) String token) {
        requireAdmin(token);
        // 탈퇴 계정은 행이 남지만 회원 수에는 넣지 않는다.
        return Map.of("totalUsers", users.countByAccountStatusIsNullOrAccountStatusNot(User.WITHDRAWN), "totalVehicles", vehicles.count());
    }

    public record VerificationSummary(Integer id, Integer vehicleId, String username, String licensePlate,
        String manufacturer, String model, Integer modelYear, String status, Instant requestedAt) {
        static VerificationSummary from(VehicleVerification v) {
            Vehicle vehicle = v.getVehicle();
            return new VerificationSummary(v.getId(), vehicle.getId(), vehicle.getUser().getUsername(),
                vehicle.getLicensePlate(), vehicle.getManufacturer(), vehicle.getModel(), vehicle.getModelYear(),
                v.getStatus(), v.getRequestedAt());
        }
    }

    @GetMapping("/vehicle-verifications")
    public List<VerificationSummary> verifications(
            @CookieValue(name = SharedSessionService.COOKIE, required = false) String token) {
        requireAdmin(token);
        return verifications.findAllByOrderByIdDesc().stream().map(VerificationSummary::from).toList();
    }

    @Transactional
    @PostMapping("/vehicle-verifications/{id}/approve")
    public VerificationSummary approve(@PathVariable Integer id,
            @CookieValue(name = SharedSessionService.COOKIE, required = false) String token) {
        User admin = requireAdmin(token);
        Review review = lockForReview(id);
        if (!review.current())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "차량의 현재 인증 신청이 아니어서 승인할 수 없습니다.");
        review.verification().approve(admin);
        review.vehicle().approveVerification(Instant.now());
        vehicles.saveAndFlush(review.vehicle());
        return VerificationSummary.from(verifications.saveAndFlush(review.verification()));
    }

    // 현재 신청이 아닌(옛) PENDING 신청도 반려해 목록에서 정리할 수 있다. 이때 차량의 인증 상태는 건드리지 않는다.
    @Transactional
    @PostMapping("/vehicle-verifications/{id}/reject")
    public VerificationSummary reject(@PathVariable Integer id,
            @CookieValue(name = SharedSessionService.COOKIE, required = false) String token) {
        User admin = requireAdmin(token);
        Review review = lockForReview(id);
        review.verification().reject(admin);
        if (review.current()) {
            review.vehicle().rejectVerification();
            vehicles.saveAndFlush(review.vehicle());
        }
        return VerificationSummary.from(verifications.saveAndFlush(review.verification()));
    }

    // current: 이 신청이 차량의 현재 심사 대상인지 — 차량이 PENDING이고 그 차량의 가장 최근 신청이다.
    // 신청 행만 PENDING이고 차량 정보·상태가 그 뒤에 바뀌었거나, 예전 데이터에 PENDING 신청이 여러 개 남은 경우는 current가 아니다.
    private record Review(Vehicle vehicle, VehicleVerification verification, boolean current) {}

    // 처리할 수 있는 신청은 심사 중(PENDING)인 것뿐이다. 이미 승인·반려된 예전 신청을 다시 승인하면
    // 핵심 필드 변경으로 해제된 인증이 새 서류 없이 되살아나고, 다시 반려하면 현재 인증이 지워진다.
    // 차량 → 신청 순서로 행을 잠그고(인증 신청과 같은 순서) 잠근 뒤의 최신 값으로 판단한다.
    // (차량 행을 잠근 뒤라 그사이 새 신청이 끼어들지 못한다.)
    private Review lockForReview(Integer id) {
        Integer vehicleId = verifications.findVehicleIdById(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "인증 신청을 찾을 수 없습니다."));
        Vehicle vehicle = vehicles.findByIdForUpdate(vehicleId).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "인증 신청을 찾을 수 없습니다."));
        VehicleVerification verification = verifications.findByIdForUpdate(id).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.NOT_FOUND, "인증 신청을 찾을 수 없습니다."));
        if (!"PENDING".equals(verification.getStatus()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "이미 처리된 인증 신청입니다.");
        boolean current = "PENDING".equals(vehicle.getVerificationStatus())
            && id.equals(verifications.findLatestIdByVehicleId(vehicleId));
        return new Review(vehicle, verification, current);
    }

    private User requireAdmin(String token) {
        SharedSessionService.SessionUser session = sessions.require(token);
        if (!"ADMIN".equals(session.role()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자만 접근할 수 있습니다.");
        User admin = users.findById(session.id()).orElseThrow(() ->
            new ResponseStatusException(HttpStatus.UNAUTHORIZED, "다시 로그인해주세요."));
        if (!"ADMIN".equals(admin.getRole()) || admin.isBlocked())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "관리자만 접근할 수 있습니다.");
        return admin;
    }
}
