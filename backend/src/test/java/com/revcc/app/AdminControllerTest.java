package com.revcc.app;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** role 검증이 프론트엔드가 아니라 서버에서 이뤄지는지 확인한다. */
class AdminControllerTest {
    private final SharedSessionService sessions = mock(SharedSessionService.class);
    private final UserRepository users = mock(UserRepository.class);
    private final GarageVehicleRepository vehicles = mock(GarageVehicleRepository.class);
    private final VehicleVerificationRepository verifications = mock(VehicleVerificationRepository.class);
    private MockMvc mvc;
    private final User admin = new User("owner", "hash", 14L);

    @BeforeEach void setup() {
        admin.manage(null,null,"ACTIVE","ADMIN",null);
        mvc = MockMvcBuilders.standaloneSetup(new AdminController(sessions, users, vehicles, verifications)).build();
        when(sessions.require(null)).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        when(sessions.require("user-token")).thenReturn(new SharedSessionService.SessionUser(1L, "member", "USER"));
        when(sessions.require("admin-token")).thenReturn(new SharedSessionService.SessionUser(14L, "owner", "ADMIN"));
        when(users.findById(14L)).thenReturn(Optional.of(admin));
        when(verifications.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        when(vehicles.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
    }

    private static User owner() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(2L);
        when(user.getUsername()).thenReturn("driver");
        return user;
    }

    @Test void demotedAdminIsForbidden() throws Exception {
        admin.manage(null,null,"ACTIVE","USER",null);
        mvc.perform(get("/api/admin/overview").cookie(new Cookie(SharedSessionService.COOKIE,"admin-token"))).andExpect(status().isForbidden());
    }

    @Test void anonymousIsUnauthorized() throws Exception {
        mvc.perform(get("/api/admin/overview")).andExpect(status().isUnauthorized());
        verifyNoInteractions(users, vehicles);
    }

    @Test void regularUserIsForbidden() throws Exception {
        mvc.perform(get("/api/admin/overview").cookie(new Cookie(SharedSessionService.COOKIE, "user-token")))
            .andExpect(status().isForbidden());
        verifyNoInteractions(users, vehicles);
    }

    @Test void adminSeesRealCounts() throws Exception {
        when(users.countByAccountStatusIsNullOrAccountStatusNot(User.WITHDRAWN)).thenReturn(11L); // 탈퇴 계정 제외
        when(vehicles.count()).thenReturn(3L);
        mvc.perform(get("/api/admin/overview").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.totalUsers").value(11))
            .andExpect(jsonPath("$.totalVehicles").value(3));
    }

    @Test void regularUserCannotListVehicleVerifications() throws Exception {
        mvc.perform(get("/api/admin/vehicle-verifications").cookie(new Cookie(SharedSessionService.COOKIE, "user-token")))
            .andExpect(status().isForbidden());
        verifyNoInteractions(verifications);
    }

    // 목록은 서류 원본 없이 필요한 칸만 고르는 findSummaries로 페이지 단위로 읽는다(엔티티 전체 조회 금지).
    @Test void adminListsVerificationSummariesPageByPage() throws Exception {
        var row = new AdminController.VerificationSummary(5, 105, "driver", "12가3456", "Hyundai", "Avante", 2022, "PENDING", java.time.Instant.parse("2026-11-01T00:00:00Z"));
        when(verifications.findSummaries(eq(false), eq("%dr\\%i\\_v%"), any())).thenReturn(
            new org.springframework.data.domain.PageImpl<>(List.of(row), org.springframework.data.domain.PageRequest.of(1, 20), 21));
        mvc.perform(get("/api/admin/vehicle-verifications").param("q", " Dr%i_V ").param("page", "2")
                .cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.total").value(21)).andExpect(jsonPath("$.page").value(2)).andExpect(jsonPath("$.pageSize").value(20))
            .andExpect(jsonPath("$.items[0].id").value(5)).andExpect(jsonPath("$.items[0].licensePlate").value("12가3456"))
            .andExpect(jsonPath("$.items[0].status").value("PENDING"));
        var pageable = org.mockito.ArgumentCaptor.forClass(org.springframework.data.domain.Pageable.class);
        verify(verifications).findSummaries(eq(false), eq("%dr\\%i\\_v%"), pageable.capture());
        assertEquals(1, pageable.getValue().getPageNumber());
        assertEquals(20, pageable.getValue().getPageSize());
        verifyNoMoreInteractions(verifications); // 엔티티 전체를 읽는 다른 조회는 하지 않는다
        when(verifications.findSummaries(eq(true), eq("%%"), any())).thenReturn(org.springframework.data.domain.Page.empty());
        mvc.perform(get("/api/admin/vehicle-verifications").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.total").value(0)).andExpect(jsonPath("$.page").value(1));
        mvc.perform(get("/api/admin/vehicle-verifications").param("page", "0").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isBadRequest());
    }

    // 관리자 승인/반려는 차량 → 신청 순서로 잠근 행을 읽는다.
    private void stubLocked(int id, Vehicle vehicle, VehicleVerification verification) {
        when(verifications.findVehicleIdById(id)).thenReturn(Optional.of(100 + id));
        when(vehicles.findByIdForUpdate(100 + id)).thenReturn(Optional.of(vehicle));
        when(verifications.findByIdForUpdate(id)).thenReturn(Optional.of(verification));
        when(verifications.findLatestIdByVehicleId(100 + id)).thenReturn(id);
    }

    @Test void adminApprovesVerificationAndVehicle() throws Exception {
        User owner = owner();
        GarageVehicleRequest request = new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567");
        Vehicle vehicle = new Vehicle(owner, request);
        vehicle.markVerificationPending();
        VehicleVerification verification = new VehicleVerification(vehicle, "image/png", new byte[]{1, 2, 3});
        stubLocked(5, vehicle, verification);

        mvc.perform(post("/api/admin/vehicle-verifications/5/approve").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPROVED"));
        verify(vehicles).saveAndFlush(vehicle);
        org.junit.jupiter.api.Assertions.assertTrue(vehicle.isVerified());
    }

    @Test void adminRejectsVerificationAndVehicle() throws Exception {
        User owner = owner();
        GarageVehicleRequest request = new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567");
        Vehicle vehicle = new Vehicle(owner, request);
        vehicle.markVerificationPending();
        VehicleVerification verification = new VehicleVerification(vehicle, "image/png", new byte[]{1, 2, 3});
        stubLocked(6, vehicle, verification);

        mvc.perform(post("/api/admin/vehicle-verifications/6/reject").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REJECTED"));
        org.junit.jupiter.api.Assertions.assertFalse(vehicle.isVerified());
        org.junit.jupiter.api.Assertions.assertEquals("REJECTED", vehicle.getVerificationStatus());
    }

    // 승인 뒤 핵심 필드를 바꿔 인증이 해제된 차량은 예전(이미 승인된) 신청으로 다시 승인되지 않는다. 반려도 마찬가지다.
    @Test void processedRequestCannotBeApprovedOrRejectedAgain() throws Exception {
        GarageVehicleRequest request = new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567");
        Vehicle vehicle = new Vehicle(owner(), request);
        vehicle.markVerificationPending();
        VehicleVerification verification = new VehicleVerification(vehicle, "image/png", new byte[]{1, 2, 3});
        stubLocked(7, vehicle, verification);
        Cookie admin = new Cookie(SharedSessionService.COOKIE, "admin-token");
        mvc.perform(post("/api/admin/vehicle-verifications/7/approve").cookie(admin)).andExpect(status().isOk());
        vehicle.update(new GarageVehicleRequest("Hyundai", "Elantra N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567"));
        org.junit.jupiter.api.Assertions.assertFalse(vehicle.isVerified());
        clearInvocations(vehicles, verifications);

        for (String action : new String[]{"approve", "reject"})
            mvc.perform(post("/api/admin/vehicle-verifications/7/" + action).cookie(admin)).andExpect(status().isConflict());
        org.junit.jupiter.api.Assertions.assertFalse(vehicle.isVerified());
        org.junit.jupiter.api.Assertions.assertNull(vehicle.getVerificationStatus());
        org.junit.jupiter.api.Assertions.assertEquals("APPROVED", verification.getStatus());
        verify(vehicles, never()).saveAndFlush(any());
        verify(verifications, never()).saveAndFlush(any());
    }

    // 같은 차량에 PENDING 신청이 둘 남아 있으면(예전 데이터) 최근 신청만 승인할 수 있다.
    // 옛 신청은 반려해 목록에서 정리할 수 있지만, 차량의 인증 상태는 건드리지 않는다.
    @Test void onlyTheLatestRequestOfTheVehicleCanBeApproved() throws Exception {
        GarageVehicleRequest request = new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567");
        Vehicle vehicle = new Vehicle(owner(), request);
        vehicle.markVerificationPending();
        VehicleVerification older = new VehicleVerification(vehicle, "image/png", new byte[]{1});
        stubLocked(8, vehicle, older);
        when(verifications.findLatestIdByVehicleId(108)).thenReturn(9);
        Cookie admin = new Cookie(SharedSessionService.COOKIE, "admin-token");
        mvc.perform(post("/api/admin/vehicle-verifications/8/approve").cookie(admin)).andExpect(status().isConflict());
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", older.getStatus());
        mvc.perform(post("/api/admin/vehicle-verifications/8/reject").cookie(admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("REJECTED"));
        org.junit.jupiter.api.Assertions.assertEquals("PENDING", vehicle.getVerificationStatus());
        verify(vehicles, never()).saveAndFlush(any());
    }
}
