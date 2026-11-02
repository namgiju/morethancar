package com.revcc.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.sql.Connection;
import java.util.*;
import java.util.concurrent.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.RequestBuilder;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/**
 * MVP 단계 1: 차량 수정·인증 신청·관리자 승인/반려가 겹칠 때 인증 상태와 차량 정보가 덮어써지지 않는지 실제 PostgreSQL로 본다.
 * 다른 경로(인증 신청·관리자 승인·board의 PUT /garage/:id)를 별도 연결의 트랜잭션으로 흉내 내 차량 행을 잡아 두고,
 * 그사이 Spring 요청을 보낸다. 요청은 잠금을 기다렸다가 커밋된 최신 값으로 판단해야 한다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="REVCC_TEST_DB_PORT",matches="[0-9]+")
class VehicleVerificationConcurrencyIntegrationTest {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",()->"jdbc:postgresql://127.0.0.1:"+System.getenv("REVCC_TEST_DB_PORT")+"/revcc_test");
        r.add("spring.datasource.username",()->"postgres"); r.add("spring.datasource.password",()->"test");
        r.add("spring.data.redis.host",()->"127.0.0.1"); r.add("spring.data.redis.port",()->System.getenv("REVCC_TEST_REDIS_PORT"));
        r.add("app.password-reset.secret",()->"integration-test-secret-at-least-32-characters");
        r.add("app.withdrawal.hmac-secret",()->"integration-test-withdrawal-secret-32-characters");
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired SharedSessionService sessions;
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();
    private static final String PNG = "data:image/png;base64," + Base64.getEncoder().encodeToString(new byte[]{
        (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0,
    });
    private final ExecutorService pool = Executors.newSingleThreadExecutor();

    User create(String role) {
        User user=new User("race-"+UUID.randomUUID().toString().substring(0,8),BCRYPT.encode("password-1"));
        if (!"USER".equals(role)) user.manage(null,null,"ACTIVE",role,null);
        return users.saveAndFlush(user);
    }
    Cookie session(User user) { return new Cookie(SharedSessionService.COOKIE, sessions.create(users.findById(user.getId()).orElseThrow())); }
    int vehicle(User owner, String status, boolean verified) {
        return jdbc.queryForObject("INSERT INTO owner_vehicles(owner_id,manufacturer,model,year,license_plate,bio,verified,verification_status) "
            + "VALUES(?,'Hyundai','Avante N',2024,'12가3456','처음 소개',?,?) RETURNING id", Integer.class, owner.getId(), verified, status);
    }
    Map<String,Object> row(int id) {
        return jdbc.queryForMap("SELECT model,bio,verified,verification_status AS status FROM owner_vehicles WHERE id=?", id);
    }
    String edit(String model, String description) throws Exception {
        return mapper.writeValueAsString(Map.of("manufacturer","Hyundai","model",model,"modelYear",2024,
            "licensePlate","12가3456","description",description));
    }

    // 다른 경로가 차량 행을 잡고 있는 동안 요청을 보내고, 요청이 기다리는지 본 뒤 그 경로의 변경을 커밋한다.
    int whileLocked(int vehicleId, String concurrentWrite, RequestBuilder request) throws Exception {
        try (Connection other = dataSource.getConnection()) {
            other.setAutoCommit(false);
            try (var lock = other.prepareStatement("SELECT 1 FROM owner_vehicles WHERE id=? FOR UPDATE")) {
                lock.setInt(1, vehicleId); lock.executeQuery();
            }
            Future<Integer> pending = pool.submit(() -> mvc.perform(request).andReturn().getResponse().getStatus());
            assertThrows(TimeoutException.class, () -> pending.get(700, TimeUnit.MILLISECONDS), "요청이 잠금을 기다려야 한다");
            try (var write = other.prepareStatement(concurrentWrite)) { write.setInt(1, vehicleId); write.executeUpdate(); }
            other.commit();
            return pending.get(10, TimeUnit.SECONDS);
        }
    }

    // 인증 신청이 먼저 PENDING으로 바꾸는 중에 들어온 핵심 필드 수정은 커밋된 PENDING을 보고 409가 된다.
    // (잠금 없이 읽으면 미신청으로 보고 수정한 뒤, 전체 컬럼 UPDATE로 PENDING을 NULL로 덮어썼다.)
    @Test void coreEditDuringSubmissionSeesPendingAndIsRejected() throws Exception {
        User owner = create("USER");
        int id = vehicle(owner, null, false);
        int status = whileLocked(id, "UPDATE owner_vehicles SET verification_status='PENDING' WHERE id=?",
            put("/api/garage/vehicles/"+id).cookie(session(owner)).contentType("application/json").content(edit("Elantra N","처음 소개")));
        assertEquals(409, status);
        assertEquals(Map.of("model","Avante N","bio","처음 소개","verified",false,"status","PENDING"), row(id));
    }

    // 관리자 승인이 커밋되는 중에 들어온 소개 수정은 승인을 덮어쓰지 않는다.
    @Test void descriptionEditDuringApprovalKeepsApproval() throws Exception {
        User owner = create("USER");
        int id = vehicle(owner, "PENDING", false);
        int status = whileLocked(id, "UPDATE owner_vehicles SET verified=true,verification_status='APPROVED',verified_at=NOW() WHERE id=?",
            put("/api/garage/vehicles/"+id).cookie(session(owner)).contentType("application/json").content(edit("Avante N","새 소개")));
        assertEquals(200, status);
        assertEquals(Map.of("model","Avante N","bio","새 소개","verified",true,"status","APPROVED"), row(id));
    }

    // board에서 소개를 고치는 중에 인증 신청이 들어와도 그 소개를 예전 값으로 되돌리지 않는다.
    @Test void submissionDuringBoardEditKeepsTheEdit() throws Exception {
        User owner = create("USER");
        int id = vehicle(owner, null, false);
        int status = whileLocked(id, "UPDATE owner_vehicles SET bio='board에서 고친 소개' WHERE id=?",
            post("/api/garage/vehicles/"+id+"/verification").cookie(session(owner)).contentType("application/json")
                .content(mapper.writeValueAsString(Map.of("data", PNG))));
        assertEquals(200, status);
        assertEquals(Map.of("model","Avante N","bio","board에서 고친 소개","verified",false,"status","PENDING"), row(id));
    }

    // board에서 소개를 고치는 중에 관리자가 승인해도 그 소개를 덮어쓰지 않고, 반려도 마찬가지다.
    @Test void approvalAndRejectionDuringBoardEditKeepTheEdit() throws Exception {
        User admin = create("ADMIN");
        for (String action : List.of("approve", "reject")) {
            User owner = create("USER");
            int id = vehicle(owner, "PENDING", false);
            int request = jdbc.queryForObject("INSERT INTO vehicle_verifications(vehicle_id,document_mime,document_data) VALUES(?,'image/png',?) RETURNING id",
                Integer.class, id, new byte[]{1});
            int status = whileLocked(id, "UPDATE owner_vehicles SET bio='board에서 고친 소개' WHERE id=?",
                post("/api/admin/vehicle-verifications/"+request+"/"+action).cookie(session(admin)));
            assertEquals(200, status, action);
            boolean approved = action.equals("approve");
            assertEquals(Map.of("model","Avante N","bio","board에서 고친 소개","verified",approved,"status",approved ? "APPROVED" : "REJECTED"), row(id));
        }
    }

    // 신청 행은 PENDING인데 차량은 이미 PENDING이 아니면(그사이 다른 처리가 끝났으면) 그 신청으로 승인하지 않는다.
    @Test void approvalRequiresTheVehicleToStillBePending() throws Exception {
        User admin = create("ADMIN"), owner = create("USER");
        int id = vehicle(owner, null, false);
        int request = jdbc.queryForObject("INSERT INTO vehicle_verifications(vehicle_id,document_mime,document_data) VALUES(?,'image/png',?) RETURNING id",
            Integer.class, id, new byte[]{1});
        assertEquals(409, mvc.perform(post("/api/admin/vehicle-verifications/"+request+"/approve").cookie(session(admin)))
            .andReturn().getResponse().getStatus());
        assertEquals(false, row(id).get("verified"));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM vehicle_verifications WHERE id=?", String.class, request));
    }

    // 예전 데이터처럼 PENDING 신청이 둘 남아 있으면 최근 신청만 처리되고, 옛 서류로는 승인되지 않는다.
    @Test void onlyTheLatestPendingRequestCanBeApproved() throws Exception {
        User admin = create("ADMIN"), owner = create("USER");
        int id = vehicle(owner, "PENDING", false);
        String insert = "INSERT INTO vehicle_verifications(vehicle_id,document_mime,document_data) VALUES(?,'image/png',?) RETURNING id";
        int older = jdbc.queryForObject(insert, Integer.class, id, new byte[]{1});
        int latest = jdbc.queryForObject(insert, Integer.class, id, new byte[]{2});
        Cookie a = session(admin);
        assertEquals(409, mvc.perform(post("/api/admin/vehicle-verifications/"+older+"/approve").cookie(a)).andReturn().getResponse().getStatus());
        assertEquals("PENDING", row(id).get("status"));
        assertEquals(200, mvc.perform(post("/api/admin/vehicle-verifications/"+latest+"/approve").cookie(a)).andReturn().getResponse().getStatus());
        assertEquals("APPROVED", row(id).get("status"));
        assertEquals("PENDING", jdbc.queryForObject("SELECT status FROM vehicle_verifications WHERE id=?", String.class, older));
    }
}
