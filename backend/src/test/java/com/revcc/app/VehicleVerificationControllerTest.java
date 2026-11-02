package com.revcc.app;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.util.Base64;
import java.util.Optional;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class VehicleVerificationControllerTest {
    private final GarageVehicleRepository vehicles = mock(GarageVehicleRepository.class);
    private final VehicleVerificationRepository verifications = mock(VehicleVerificationRepository.class);
    private final SharedSessionService sessions = mock(SharedSessionService.class);
    private MockMvc mvc;
    private final GarageVehicleRequest request =
        new GarageVehicleRequest("Hyundai", "Avante N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567");
    private final Vehicle vehicle = new Vehicle(owner(), request);

    private static User owner() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(1L);
        when(user.getUsername()).thenReturn("driver");
        return user;
    }

    // 1x1 PNG.
    private static final String PNG = "data:image/png;base64," + Base64.getEncoder().encodeToString(new byte[]{
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0,
    });

    @BeforeEach void setup() {
        mvc = MockMvcBuilders.standaloneSetup(new VehicleVerificationController(vehicles, verifications, sessions)).build();
        when(sessions.require(null)).thenThrow(new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        when(sessions.require("owner-token")).thenReturn(new SharedSessionService.SessionUser(1L, "driver", "USER"));
        when(sessions.require("other-token")).thenReturn(new SharedSessionService.SessionUser(2L, "stranger", "USER"));
        when(sessions.require("admin-token")).thenReturn(new SharedSessionService.SessionUser(9L, "admin", "ADMIN"));
    }

    @Test void anonymousCannotSubmit() throws Exception {
        mvc.perform(post("/api/garage/vehicles/1/verification").contentType(MediaType.APPLICATION_JSON)
            .content("{\"data\":\"" + PNG + "\"}")).andExpect(status().isUnauthorized());
        verifyNoInteractions(verifications);
    }

    @Test void ownerCanSubmitPendingRequest() throws Exception {
        when(vehicles.findById(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.saveAndFlush(vehicle)).thenReturn(vehicle);
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"" + PNG + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.verificationStatus").value("PENDING"));
        verify(verifications).saveAndFlush(any());
    }

    @Test void nonOwnerCannotSubmit() throws Exception {
        when(vehicles.findById(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "other-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"" + PNG + "\"}"))
            .andExpect(status().isForbidden());
        verifyNoInteractions(verifications);
    }

    @Test void rejectsAlreadyPendingVehicle() throws Exception {
        vehicle.markVerificationPending();
        when(vehicles.findById(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"" + PNG + "\"}"))
            .andExpect(status().isConflict());
        verifyNoInteractions(verifications);
    }

    // 승인 뒤 핵심 필드를 바꿔 인증이 해제된 차량은 기존 신청 경로로 다시 PENDING이 된다.
    @Test void vehicleWhoseVerificationWasClearedCanReapply() throws Exception {
        vehicle.approveVerification(java.time.Instant.now());
        vehicle.update(new GarageVehicleRequest("Hyundai", "Elantra N", 2024, "N", "DCT", "Blue", "my N", "desc", "123가4567"));
        when(vehicles.findById(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.saveAndFlush(vehicle)).thenReturn(vehicle);
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"" + PNG + "\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.verified").value(false))
            .andExpect(jsonPath("$.verificationStatus").value("PENDING"));
        verify(verifications).saveAndFlush(any());
    }

    // 보관한 차량은 인증을 신청할 수 없다(MVP 단계 2). 아무것도 저장하지 않는다.
    @Test void archivedVehicleCannotApply() throws Exception {
        org.springframework.test.util.ReflectionTestUtils.setField(vehicle, "archivedAt", java.time.Instant.now());
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"" + PNG + "\"}"))
            .andExpect(status().isConflict());
        verifyNoInteractions(verifications);
        verify(vehicles, never()).saveAndFlush(any());
    }

    @Test void rejectsInvalidImage() throws Exception {
        when(vehicles.findById(1)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByIdForUpdate(1)).thenReturn(Optional.of(vehicle));
        mvc.perform(post("/api/garage/vehicles/1/verification").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token"))
            .contentType(MediaType.APPLICATION_JSON).content("{\"data\":\"data:text/plain;base64,aGk=\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(verifications);
        // 서류 검사는 차량 행을 잠그기 전에 끝난다(잘못된 서류로 잠금을 잡지 않는다).
        verify(vehicles, never()).findByIdForUpdate(any());
    }

    @Test void documentIsVisibleToOwnerAndAdminOnly() throws Exception {
        VehicleVerification verification = new VehicleVerification(vehicle, "image/png", new byte[]{1, 2, 3});
        when(verifications.findById(7)).thenReturn(Optional.of(verification));

        mvc.perform(get("/api/garage/vehicle-verifications/7/document").cookie(new Cookie(SharedSessionService.COOKIE, "owner-token")))
            .andExpect(status().isOk());
        mvc.perform(get("/api/garage/vehicle-verifications/7/document").cookie(new Cookie(SharedSessionService.COOKIE, "admin-token")))
            .andExpect(status().isOk());
        mvc.perform(get("/api/garage/vehicle-verifications/7/document").cookie(new Cookie(SharedSessionService.COOKIE, "other-token")))
            .andExpect(status().isForbidden());
    }
}
