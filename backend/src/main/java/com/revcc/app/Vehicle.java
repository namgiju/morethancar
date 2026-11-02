package com.revcc.app;

import jakarta.persistence.*;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;

/** 소유 차량. 기존 HTML 차고의 owner_vehicles를 그대로 사용한다.
 * 공용 카탈로그 vehicles 및 그 조회 API와는 별개다. */
@Entity
@Table(name = "owner_vehicles")
public class Vehicle {
    // 기존 SERIAL 및 차량 기록 FK와 호환되는 INTEGER 식별자.
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Integer id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private User user;

    @Column(nullable = false, length = 100, columnDefinition = "varchar(100) default ''")
    private String manufacturer = "";
    @Column(nullable = false, length = 100)
    private String model;
    @Column(name = "year", nullable = false)
    private Integer modelYear;
    @Column(nullable = false, length = 100, columnDefinition = "varchar(100) default ''")
    private String trim = "";
    @Column(nullable = false, length = 50, columnDefinition = "varchar(50) default ''")
    private String transmission = "";
    @Column(nullable = false, length = 100, columnDefinition = "varchar(100) default ''")
    private String color = "";
    @Column(nullable = false, length = 100, columnDefinition = "varchar(100) default ''")
    private String nickname = "";
    @Column(name = "bio", nullable = false, length = 1000, columnDefinition = "varchar(1000) default ''")
    private String description = "";

    @Column(name = "license_plate", nullable = false, length = 20, columnDefinition = "varchar(20) default ''")
    private String licensePlate = "";
    // 오너 인증 상태. 신청 전이면 null, 그 후로는 vehicle_verifications의 최신 결과를 반영한다.
    @Column(nullable = false)
    private boolean verified = false;
    @Column(name = "verification_status")
    private String verificationStatus;
    @Column(name = "verified_at")
    private Instant verifiedAt;

    // 이미 HTML 차고에서 사용하는 컬럼만 보존한다. 이번 API에는 사진 기능을 추가하지 않는다.
    @Column(name = "image_id")
    private Integer legacyImageId;
    @Column(name = "created_at", nullable = false, updatable = false,
        columnDefinition = "timestamp with time zone default CURRENT_TIMESTAMP")
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false,
        columnDefinition = "timestamp with time zone default CURRENT_TIMESTAMP")
    private Instant updatedAt;

    protected Vehicle() {}

    public Vehicle(User user, GarageVehicleRequest request) {
        this.user = user;
        update(request);
    }

    // 핵심 필드(제조사·모델·연식·번호판)는 인증 서류가 증명하는 값이다. 심사 중에는 바꿀 수 없고(409),
    // 승인된 차량에서 바꾸면 인증을 해제한다(vehicle_verifications 이력은 그대로, 재인증은 기존 신청 경로).
    public void update(GarageVehicleRequest request) {
        String newManufacturer = request.manufacturer().trim();
        String newModel = request.model().trim();
        String newLicensePlate = request.licensePlate().trim();
        boolean coreChanged = !newManufacturer.equals(manufacturer) || !newModel.equals(model)
            || !Objects.equals(request.modelYear(), modelYear) || !newLicensePlate.equals(licensePlate);
        if (coreChanged && "PENDING".equals(verificationStatus))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "인증 심사 중에는 차종·연식·번호판을 수정할 수 없어요.");
        if (coreChanged && (verified || "APPROVED".equals(verificationStatus))) {
            verified = false;
            verificationStatus = null;
            verifiedAt = null;
        }
        manufacturer = newManufacturer;
        model = newModel;
        modelYear = request.modelYear();
        trim = clean(request.trim());
        transmission = clean(request.transmission());
        color = clean(request.color());
        nickname = clean(request.nickname());
        description = clean(request.description());
        licensePlate = newLicensePlate;
    }

    // 인증 요청 접수. 반려된 뒤 재신청할 때도 동일하게 PENDING으로 되돌린다.
    public void markVerificationPending() {
        verified = false;
        verificationStatus = "PENDING";
        verifiedAt = null;
    }

    public void approveVerification(Instant at) {
        verified = true;
        verificationStatus = "APPROVED";
        verifiedAt = at;
    }

    public void rejectVerification() {
        verified = false;
        verificationStatus = "REJECTED";
        verifiedAt = null;
    }

    private static String clean(String value) { return value == null ? "" : value.trim(); }
    @PrePersist
    void created() { createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS); updatedAt = createdAt; }
    @PreUpdate
    void updated() { updatedAt = Instant.now().truncatedTo(ChronoUnit.MICROS); }

    public Integer getId() { return id; }
    public User getUser() { return user; }
    public String getManufacturer() { return manufacturer; }
    public String getModel() { return model; }
    public Integer getModelYear() { return modelYear; }
    public String getTrim() { return trim; }
    public String getTransmission() { return transmission; }
    public String getColor() { return color; }
    public String getNickname() { return nickname; }
    public String getDescription() { return description; }
    public String getLicensePlate() { return licensePlate; }
    public boolean isVerified() { return verified; }
    public String getVerificationStatus() { return verificationStatus; }
    public Instant getVerifiedAt() { return verifiedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
}
