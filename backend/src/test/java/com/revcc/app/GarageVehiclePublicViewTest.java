package com.revcc.app;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import jakarta.servlet.http.Cookie;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 공개 차량 프로필(GET /api/vehicles/{id}, 로그인 불필요)은 번호판·심사 상태·인증 시각을 내보내지 않고 인증 여부(verified)만 준다.
 * 소유자 본인 목록(GET /api/garage/vehicles)은 그대로 모두 준다. 실제 서비스(GarageVehicleService)로 JSON까지 확인한다.
 */
class GarageVehiclePublicViewTest {
    private final GarageVehicleRepository repository = mock(GarageVehicleRepository.class);
    private final SharedSessionService sessions = mock(SharedSessionService.class);
    private final MockMvc mvc = MockMvcBuilders.standaloneSetup(
        new GarageVehicleController(new GarageVehicleService(repository, mock(UserRepository.class)), sessions))
        .setControllerAdvice(new GarageExceptionHandler()).build();

    private Vehicle vehicle(String status) {
        User owner = mock(User.class);
        when(owner.getId()).thenReturn(7L);
        when(owner.getUsername()).thenReturn("owner");
        Vehicle v = new Vehicle(owner, new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567"));
        switch (status) {
            case "PENDING" -> v.markVerificationPending();
            case "REJECTED" -> { v.markVerificationPending(); v.rejectVerification(); }
            case "APPROVED" -> { v.markVerificationPending(); v.approveVerification(Instant.parse("2026-11-01T00:00:00Z")); }
            default -> { }
        }
        return v;
    }

    @Test void publicProfileHidesPlateAndReviewInfoForEveryStatus() throws Exception {
        for (String status : List.of("PENDING", "REJECTED", "APPROVED", "NONE")) {
            Vehicle v = vehicle(status);
            when(repository.findById(15)).thenReturn(Optional.of(v));
            mvc.perform(get("/api/vehicles/15"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.model").value("Avante N"))
                .andExpect(jsonPath("$.verified").value("APPROVED".equals(status)))
                .andExpect(jsonPath("$.licensePlate").isEmpty())
                .andExpect(jsonPath("$.verificationStatus").isEmpty())
                .andExpect(jsonPath("$.verifiedAt").isEmpty());
        }
    }

    @Test void ownerListKeepsPlateAndReviewInfo() throws Exception {
        when(sessions.require("t")).thenReturn(new SharedSessionService.SessionUser(7L, "owner", "USER"));
        List<Vehicle> mine = List.of(vehicle("APPROVED"), vehicle("REJECTED"));
        when(repository.findByUserIdOrderByIdDesc(7L)).thenReturn(mine);
        mvc.perform(get("/api/garage/vehicles").cookie(new Cookie(SharedSessionService.COOKIE, "t")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].licensePlate").value("123가4567"))
            .andExpect(jsonPath("$[0].verificationStatus").value("APPROVED"))
            .andExpect(jsonPath("$[0].verifiedAt").isNotEmpty())
            .andExpect(jsonPath("$[1].verificationStatus").value("REJECTED"));
    }
}
