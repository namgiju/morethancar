package com.revcc.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 관리자 인증 신청 목록(GET /api/admin/vehicle-verifications)을 실제 PostgreSQL로 본다: 페이지(20건)로 과거 신청까지 넘겨 볼 수 있고,
 * 심사 중이 먼저 오며, 목록 SQL은 서류 원본(document_data)을 읽지 않는다. 서류는 개별 조회에서만 나온다.
 */
@SpringBootTest(properties = "spring.jpa.show-sql=true")
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfEnvironmentVariable(named="REVCC_TEST_DB_PORT",matches="[0-9]+")
class VehicleVerificationListIntegrationTest {
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
    @Autowired SharedSessionService sessions;
    @Autowired JdbcTemplate jdbc;

    Cookie admin() {
        User a = new User("vl-admin-"+UUID.randomUUID().toString().substring(0,8), "x");
        a.manage(null, null, "ACTIVE", "ADMIN", null);
        return new Cookie(SharedSessionService.COOKIE, sessions.create(users.saveAndFlush(a)));
    }
    JsonNode list(Cookie c, String q, int page) throws Exception {
        return mapper.readTree(mvc.perform(get("/api/admin/vehicle-verifications").param("q", q).param("page", String.valueOf(page)).cookie(c))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    @Test void pagesThroughOldRequestsPendingFirstWithoutReadingDocuments(CapturedOutput output) throws Exception {
        String prefix = "vl" + UUID.randomUUID().toString().substring(0, 8);
        long owner = users.saveAndFlush(new User(prefix + "-owner", "x")).getId();
        int pendingId = 0;
        // 가장 오래된 신청 하나만 심사 중, 나머지 22건은 처리 완료. 심사 중이 1페이지 맨 위에 와야 한다.
        for (int i = 0; i < 23; i++) {
            int car = jdbc.queryForObject("INSERT INTO owner_vehicles(owner_id,manufacturer,model,year,license_plate) VALUES(?,'Hyundai','Avante',2022,?) RETURNING id",
                Integer.class, owner, prefix.substring(2) + "가" + (1000 + i));
            int id = jdbc.queryForObject("INSERT INTO vehicle_verifications(vehicle_id,status,document_mime,document_data) VALUES(?,?,'image/png',?) RETURNING id",
                Integer.class, car, i == 0 ? "PENDING" : (i % 2 == 0 ? "APPROVED" : "REJECTED"), new byte[]{(byte) i, 1, 2, 3});
            if (i == 0) pendingId = id;
        }
        Cookie c = admin();
        int before = output.getOut().length();
        JsonNode first = list(c, prefix.toUpperCase(), 1);
        String listSql = output.getOut().substring(before);
        assertEquals(23, first.get("total").asInt());
        assertEquals(20, first.get("pageSize").asInt());
        assertEquals(20, first.get("items").size());
        assertEquals(pendingId, first.get("items").get(0).get("id").asInt(), "심사 중 신청이 먼저");
        assertEquals("PENDING", first.get("items").get(0).get("status").asText());
        assertEquals(prefix + "-owner", first.get("items").get(0).get("username").asText());
        assertEquals(prefix.substring(2) + "가1000", first.get("items").get(0).get("licensePlate").asText());
        assertFalse(first.get("items").get(0).has("documentData"));
        assertTrue(listSql.contains("vehicle_verifications"), "목록 SQL이 로그에 찍혀야 비교할 수 있다");
        assertFalse(listSql.contains("document_data"), "목록은 서류 원본 컬럼을 읽지 않는다:\n" + listSql);
        // 2페이지: 과거 신청 나머지 3건.
        JsonNode second = list(c, prefix, 2);
        assertEquals(3, second.get("items").size());
        assertEquals(2, second.get("page").asInt());
        // 차량번호 검색, 와일드카드 문자는 글자 그대로 비교한다.
        assertEquals(1, list(c, prefix.substring(2) + "가1022", 1).get("total").asInt());
        assertEquals(0, list(c, prefix + "%", 1).get("total").asInt());
        // 서류는 개별 조회에서만 나온다.
        byte[] document = mvc.perform(get("/api/garage/vehicle-verifications/" + pendingId + "/document").cookie(c))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "private, no-store"))
            .andReturn().getResponse().getContentAsByteArray();
        assertArrayEquals(new byte[]{0, 1, 2, 3}, document);
    }
}
