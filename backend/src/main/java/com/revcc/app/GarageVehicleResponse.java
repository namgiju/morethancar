package com.revcc.app;

import java.time.Instant;

/** Entity를 직접 직렬화하지 않아 비밀번호와 지연 로딩 관계가 노출되지 않는다. */
public record GarageVehicleResponse(
    Integer id, Long userId, String manufacturer, String model, Integer modelYear,
    String trim, String transmission, String color, String nickname, String description,
    Instant createdAt, Instant updatedAt, String username,
    String licensePlate, boolean verified, String verificationStatus, Instant verifiedAt, Instant archivedAt
) {
    public static GarageVehicleResponse from(Vehicle vehicle) {
        return new GarageVehicleResponse(vehicle.getId(), vehicle.getUser().getId(),
            vehicle.getManufacturer(), vehicle.getModel(), vehicle.getModelYear(),
            vehicle.getTrim(), vehicle.getTransmission(), vehicle.getColor(), vehicle.getNickname(),
            vehicle.getDescription(), vehicle.getCreatedAt(), vehicle.getUpdatedAt(), vehicle.getUser().getUsername(),
            vehicle.getLicensePlate(), vehicle.isVerified(), vehicle.getVerificationStatus(), vehicle.getVerifiedAt(),
            vehicle.getArchivedAt());
    }

    // 인증 없이 누구나 조회하는 공개 프로필 응답(GET /api/vehicles/{id}). 번호판과 심사 정보(심사 상태·인증 시각)는
    // 소유자 본인 화면(내 차고 목록/등록/수정, GET /api/garage/vehicles)과 관리자 인증 목록에서만 내려준다.
    // 공개해도 되는 것은 인증 여부(verified)뿐이다 — board 공개 차고(GET /api/board/garage/:id)와 같은 규칙(MVP 단계 4).
    public GarageVehicleResponse publicView() {
        return new GarageVehicleResponse(id, userId, manufacturer, model, modelYear, trim, transmission,
            color, nickname, description, createdAt, updatedAt, username, null, verified, null, null, archivedAt);
    }
}
