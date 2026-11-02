package com.revcc.app;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.util.List;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class GarageVehicleServiceTest {
    private final GarageVehicleRepository vehicles = mock(GarageVehicleRepository.class);
    private final UserRepository users = mock(UserRepository.class);
    private final GarageVehicleService service = new GarageVehicleService(vehicles, users);
    private final GarageVehicleRequest request = new GarageVehicleRequest("Hyundai", "Avante N", 2024,
        "N", "DCT", "Performance Blue", "기주의 아반떼 N", "오너 차량", "123가4567");

    private User owner() {
        User user = mock(User.class);
        when(user.getId()).thenReturn(7L);
        when(user.getUsername()).thenReturn("owner");
        return user;
    }

    @Test void createsWithServerSelectedOwnerAndNormalizesOptionalValues() {
        User user = owner();
        when(users.findById(7L)).thenReturn(Optional.of(user));
        when(vehicles.saveAndFlush(any())).thenAnswer(call -> call.getArgument(0));
        GarageVehicleResponse result = service.create(7L, request);
        assertEquals(7L, result.userId());
        assertEquals("owner", result.username());
        assertEquals("Performance Blue", result.color());
        Vehicle minimal = new Vehicle(owner(), new GarageVehicleRequest(" Hyundai ", " Avante N ", 2024,
            null, null, null, null, null, "123가4567"));
        assertEquals("Hyundai", minimal.getManufacturer());
        assertEquals("", minimal.getDescription());
    }

    @Test void listIsScopedToCurrentUser() {
        Vehicle vehicle = new Vehicle(owner(), request);
        when(vehicles.findByUserIdOrderByIdDesc(7L)).thenReturn(List.of(vehicle));
        assertEquals(1, service.mine(7L).size());
        verify(vehicles).findByUserIdOrderByIdDesc(7L);
    }

    @Test void rejectsOtherOwnersUpdateAndDelete() {
        Vehicle vehicle = new Vehicle(owner(), request);
        when(vehicles.findById(15)).thenReturn(Optional.of(vehicle));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.update(15, 9L, request)).getStatusCode().value());
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> service.delete(15, 9L)).getStatusCode().value());
        verify(vehicles, never()).saveAndFlush(any());
        verify(vehicles, never()).delete(any());
    }

    @Test void ownerCanUpdateAndDeleteAndMissingVehicleIs404() {
        Vehicle vehicle = new Vehicle(owner(), request);
        when(vehicles.findById(15)).thenReturn(Optional.of(vehicle));
        when(vehicles.saveAndFlush(vehicle)).thenReturn(vehicle);
        assertEquals(7L, service.update(15, 7L, request).userId());
        service.delete(15, 7L);
        verify(vehicles).delete(vehicle);
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.profile(999)).getStatusCode().value());
    }

    private Vehicle saved(Vehicle vehicle) {
        when(vehicles.findById(15)).thenReturn(Optional.of(vehicle));
        when(vehicles.saveAndFlush(vehicle)).thenReturn(vehicle);
        return vehicle;
    }

    private GarageVehicleRequest with(String manufacturer, String model, int year, String plate, String description) {
        return new GarageVehicleRequest(manufacturer, model, year, "N", "DCT", "Performance Blue", "기주의 아반떼 N", description, plate);
    }

    // 인증 서류가 증명하는 값(제조사·모델·연식·번호판)이 바뀌면 승인된 인증을 해제한다.
    @Test void approvedVehicleLosesVerificationWhenCoreFieldChanges() {
        for (GarageVehicleRequest changed : List.of(
                with("Kia", "Avante N", 2024, "123가4567", "오너 차량"),
                with("Hyundai", "Elantra N", 2024, "123가4567", "오너 차량"),
                with("Hyundai", "Avante N", 2023, "123가4567", "오너 차량"),
                with("Hyundai", "Avante N", 2024, "98나7654", "오너 차량"))) {
            Vehicle vehicle = saved(new Vehicle(owner(), request));
            vehicle.approveVerification(java.time.Instant.now());
            GarageVehicleResponse result = service.update(15, 7L, changed);
            assertFalse(result.verified());
            assertNull(vehicle.getVerificationStatus());
            assertNull(vehicle.getVerifiedAt());
        }
    }

    // 소개·별명 등만 바꾸거나, 앞뒤 공백만 다른 값(서버가 trim한 뒤 비교)은 인증을 유지한다.
    @Test void approvedVehicleKeepsVerificationWhenOnlyOtherFieldsChange() {
        Vehicle vehicle = saved(new Vehicle(owner(), request));
        vehicle.approveVerification(java.time.Instant.now());
        service.update(15, 7L, with(" Hyundai ", " Avante N ", 2024, " 123가4567 ", "새 소개"));
        assertTrue(vehicle.isVerified());
        assertEquals("APPROVED", vehicle.getVerificationStatus());
        assertEquals("새 소개", vehicle.getDescription());
    }

    @Test void pendingVehicleRejectsCoreChangesButAllowsOtherFields() {
        Vehicle vehicle = saved(new Vehicle(owner(), request));
        vehicle.markVerificationPending();
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
            () -> service.update(15, 7L, with("Hyundai", "Elantra N", 2024, "123가4567", "오너 차량")));
        assertEquals(409, error.getStatusCode().value());
        assertEquals("Avante N", vehicle.getModel());
        verify(vehicles, never()).saveAndFlush(any());
        service.update(15, 7L, with("Hyundai", "Avante N", 2024, "123가4567", "새 소개"));
        assertEquals("PENDING", vehicle.getVerificationStatus());
        assertEquals("새 소개", vehicle.getDescription());
    }

    @Test void unverifiedAndRejectedVehiclesCanChangeCoreFieldsFreely() {
        Vehicle fresh = saved(new Vehicle(owner(), request));
        service.update(15, 7L, with("Kia", "EV6", 2023, "98나7654", "오너 차량"));
        assertEquals("EV6", fresh.getModel());
        assertNull(fresh.getVerificationStatus());

        Vehicle rejected = saved(new Vehicle(owner(), request));
        rejected.rejectVerification();
        service.update(15, 7L, with("Kia", "EV6", 2023, "98나7654", "오너 차량"));
        assertEquals("EV6", rejected.getModel());
        assertEquals("REJECTED", rejected.getVerificationStatus());
    }

    @Test void publicProfileHidesLicensePlateButOwnListKeepsIt() {
        Vehicle vehicle = new Vehicle(owner(), request);
        when(vehicles.findById(15)).thenReturn(Optional.of(vehicle));
        when(vehicles.findByUserIdOrderByIdDesc(7L)).thenReturn(List.of(vehicle));
        assertNull(service.profile(15).licensePlate());
        assertEquals("123가4567", service.mine(7L).get(0).licensePlate());
    }

    @Test void timestampsUsePostgresPrecisionAndCreationTimeIsPreserved() {
        Vehicle vehicle = new Vehicle(owner(), request);
        vehicle.created();
        var createdAt = vehicle.getCreatedAt();
        assertEquals(createdAt, vehicle.getUpdatedAt());
        assertEquals(0, createdAt.getNano() % 1000);
        vehicle.updated();
        assertEquals(createdAt, vehicle.getCreatedAt());
        assertEquals(0, vehicle.getUpdatedAt().getNano() % 1000);
    }
}
