package com.revcc.app;

import com.fasterxml.jackson.databind.*;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * 콘텐츠 운영자(MANAGER) 역할과 운영자 권한 관리 API(PUT /api/admin/members/{id}/role, GET .../operators)를
 * 실제 PostgreSQL(Flyway V1~V6)과 Redis로 검증한다. 관리자 수는 DB 전체 기준이라 관리자 관련 테스트는 시작할 때
 * 기존 관리자·운영자를 일반 회원으로 돌린다(격리 테스트 DB 전용, WithdrawnMemberIntegrationTest와 같은 방식).
 */
@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named="REVCC_TEST_DB_PORT",matches="[0-9]+")
class OperatorRoleIntegrationTest {
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
    @Autowired SharedSessionService sessions;
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder();
    private static final AtomicInteger ADDRESS = new AtomicInteger(1);

    String body(Object o) throws Exception { return mapper.writeValueAsString(o); }
    JsonNode json(MvcResult r) throws Exception { return mapper.readTree(r.getResponse().getContentAsString()); }
    Cookie session(User user) { return new Cookie(SharedSessionService.COOKIE, sessions.create(users.findById(user.getId()).orElseThrow())); }
    User create(String prefix, String role) {
        User user=new User(prefix+"-"+UUID.randomUUID().toString().substring(0,8),BCRYPT.encode("password-1"));
        if (!"USER".equals(role)) user.manage(null,null,"ACTIVE",role,null);
        return users.saveAndFlush(user);
    }
    ResultActions putRole(Cookie actor, Long id, String role) throws Exception {
        var request=put("/api/admin/members/"+id+"/role").contentType("application/json").content(body(Map.of("role",role)));
        return mvc.perform(actor==null ? request : request.cookie(actor));
    }
    String role(User u) { return jdbc.queryForObject("SELECT role FROM users WHERE id=?",String.class,u.getId()); }
    List<String> actions(User target) {
        return jdbc.queryForList("SELECT action FROM admin_member_actions WHERE user_id=? ORDER BY id",String.class,target.getId());
    }
    void resetOperators() { jdbc.update("UPDATE users SET role='USER' WHERE role IN ('ADMIN','MANAGER')"); }

    @Test void adminGrantsAndRevokesManagerWithAuditAndSessionInvalidation() throws Exception {
        resetOperators();
        User admin=create("op-admin","ADMIN"), member=create("op-member","USER");
        Cookie a=session(admin), oldMemberSession=session(member);
        var granted=json(putRole(a,member.getId(),"MANAGER").andExpect(status().isOk()).andReturn());
        assertEquals("MANAGER",granted.get("role").asText());
        assertEquals("MANAGER",role(member));
        // 역할이 바뀌면 이전 세션은 끝난다(새 권한은 다시 로그인해야 적용).
        mvc.perform(get("/api/auth/me").cookie(oldMemberSession)).andExpect(status().isUnauthorized());
        // 운영자 목록에 보인다.
        var operators=json(mvc.perform(get("/api/admin/members/operators").cookie(a)).andExpect(status().isOk()).andReturn());
        Set<Long> ids=new HashSet<>(); operators.forEach(o->ids.add(o.get("id").asLong()));
        assertTrue(ids.containsAll(List.of(admin.getId(),member.getId())));
        // 같은 역할로의 변경은 아무것도 기록하지 않는다. 해제(MANAGER→USER)도 기록된다.
        putRole(a,member.getId(),"MANAGER").andExpect(status().isOk());
        putRole(a,member.getId(),"USER").andExpect(status().isOk());
        assertEquals("USER",role(member));
        assertEquals(List.of("ROLE:USER>MANAGER","ROLE:MANAGER>USER"),actions(member));
        // 수행자와 시각도 남는다.
        Map<String,Object> last=jdbc.queryForMap("SELECT admin_id,created_at FROM admin_member_actions WHERE user_id=? ORDER BY id DESC LIMIT 1",member.getId());
        assertEquals(admin.getId(),((Number)last.get("admin_id")).longValue());
        assertNotNull(last.get("created_at"));
    }

    @Test void onlyAdminsCanManageRolesAndManagersGetNoExistingAdminApi() throws Exception {
        resetOperators();
        User admin=create("op-admin","ADMIN"), manager=create("op-manager","MANAGER"), member=create("op-member","USER");
        Cookie m=session(manager), u=session(member);
        putRole(null,member.getId(),"MANAGER").andExpect(status().isUnauthorized());
        putRole(u,member.getId(),"MANAGER").andExpect(status().isForbidden());
        // MANAGER는 다른 회원은 물론 자기 자신의 권한도 바꿀 수 없고, ADMIN으로 올릴 수도 없다.
        putRole(m,member.getId(),"MANAGER").andExpect(status().isForbidden());
        putRole(m,manager.getId(),"ADMIN").andExpect(status().isForbidden());
        putRole(m,admin.getId(),"USER").andExpect(status().isForbidden());
        assertEquals("USER",role(member)); assertEquals("MANAGER",role(manager)); assertEquals("ADMIN",role(admin));
        // 기존 관리자 API(회원 관리·개요·차량 인증)는 MANAGER에게 열리지 않는다.
        for (String path : List.of("/api/admin/members","/api/admin/members/operators","/api/admin/overview","/api/admin/vehicle-verifications"))
            mvc.perform(get(path).cookie(m)).andExpect(status().isForbidden());
        mvc.perform(patch("/api/admin/members/"+member.getId()).cookie(m).contentType("application/json")
            .content(body(Map.of("status","DISABLED","role","USER")))).andExpect(status().isForbidden());
        assertTrue(actions(member).isEmpty());
    }

    @Test void lastAdminAndSelfChangeAreProtected() throws Exception {
        resetOperators();
        User only=create("op-only-admin","ADMIN");
        Cookie a=session(only);
        // 관리자가 혼자일 때 자기 자신을 MANAGER·USER로 내릴 수 없다(역할 API·기존 회원 수정 API 모두).
        putRole(a,only.getId(),"MANAGER").andExpect(status().isConflict());
        putRole(a,only.getId(),"USER").andExpect(status().isConflict());
        mvc.perform(patch("/api/admin/members/"+only.getId()).cookie(a).contentType("application/json")
            .content(body(Map.of("status","ACTIVE","role","MANAGER")))).andExpect(status().isConflict());
        assertEquals("ADMIN",role(only));
        // 두 번째 관리자는 MANAGER로 내릴 수 있다(관리자 1명이 남는다). 강등된 관리자의 세션은 끝난다.
        User second=create("op-second-admin","ADMIN");
        Cookie b=session(second);
        putRole(a,second.getId(),"MANAGER").andExpect(status().isOk());
        mvc.perform(get("/api/admin/members").cookie(b)).andExpect(status().isUnauthorized());
        assertEquals(1,jdbc.queryForObject("SELECT count(*) FROM users WHERE role='ADMIN' AND COALESCE(account_status,'ACTIVE')='ACTIVE'",Integer.class));
        // 새로 로그인한(새 세션) MANAGER도 관리자 API는 403이다.
        mvc.perform(get("/api/admin/members").cookie(session(second))).andExpect(status().isForbidden());
    }

    @Test void restrictedOrWithdrawnMembersAndInvalidRoles() throws Exception {
        resetOperators();
        User admin=create("op-admin","ADMIN"), suspended=create("op-suspended","USER"), member=create("op-member","USER");
        Cookie a=session(admin);
        jdbc.update("UPDATE users SET account_status='DISABLED' WHERE id=?",suspended.getId());
        putRole(a,suspended.getId(),"MANAGER").andExpect(status().isConflict());
        // 역할 값 검증: API와 DB(V6 users_role_check) 모두 USER·MANAGER·ADMIN만 받는다.
        putRole(a,member.getId(),"OWNER").andExpect(status().isBadRequest());
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("UPDATE users SET role='SUPERUSER' WHERE id=?",member.getId()));
        // 탈퇴 회원은 바꿀 수 없다.
        User gone=users.findById(member.getId()).orElseThrow(); gone.markWithdrawn(java.time.Instant.now()); users.saveAndFlush(gone);
        putRole(a,member.getId(),"MANAGER").andExpect(status().isConflict());
        putRole(a,999_999_999L,"MANAGER").andExpect(status().isNotFound());
    }

    @Test void managerMustDropRoleBeforeWithdrawal() throws Exception {
        resetOperators();
        create("op-admin","ADMIN");
        User manager=create("op-manager","MANAGER");
        Cookie m=session(manager);
        var info=json(mvc.perform(get("/api/auth/withdraw").cookie(m)).andExpect(status().isOk()).andReturn());
        assertTrue(info.get("admin").asBoolean());
        mvc.perform(post("/api/auth/withdraw").with(r -> { r.setRemoteAddr("203.0.113."+(200+ADDRESS.getAndIncrement()%50)); return r; })
                .cookie(m).contentType("application/json").content(body(Map.of("password","password-1","confirm",true))))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ADMIN_ROLE"));
        assertEquals("MANAGER",role(manager));
        assertEquals("ACTIVE",jdbc.queryForObject("SELECT COALESCE(account_status,'ACTIVE') FROM users WHERE id=?",String.class,manager.getId()));
    }
}
