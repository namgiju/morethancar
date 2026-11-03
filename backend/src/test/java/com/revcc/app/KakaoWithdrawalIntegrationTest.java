package com.revcc.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * LATER-1 카카오 계정 탈퇴를 실제 PostgreSQL(Flyway 전체)과 Redis로 검증한다. 카카오 HTTP만 KakaoOAuthService 목으로 대신한다
 * (HTTP 형식은 KakaoOAuthServiceTest). 순서: 시작(POST /kakao/withdraw) → 콜백(GET /kakao/callback) → 세션 확인 → 사전 검사 →
 * 재인증·연결 끊기 → 짧은 탈퇴 트랜잭션. MVP 데이터(현재·보관 차량, 공개·비공개 부품, 부품 사진, 부품에 연결된 글) 정리도 본다.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@EnabledIfEnvironmentVariable(named="REVCC_TEST_DB_PORT",matches="[0-9]+")
class KakaoWithdrawalIntegrationTest {
    @DynamicPropertySource static void properties(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url",()->"jdbc:postgresql://127.0.0.1:"+System.getenv("REVCC_TEST_DB_PORT")+"/revcc_test");
        r.add("spring.datasource.username",()->"postgres"); r.add("spring.datasource.password",()->"test");
        r.add("spring.data.redis.host",()->"127.0.0.1"); r.add("spring.data.redis.port",()->System.getenv("REVCC_TEST_REDIS_PORT"));
        r.add("app.password-reset.secret",()->"integration-test-secret-at-least-32-characters");
        r.add("app.withdrawal.hmac-secret",()->"withdrawal-integration-secret-at-least-32-chars");
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired UserRepository users;
    @Autowired JdbcTemplate jdbc;
    @Autowired SharedSessionService sessions;
    @Autowired StringRedisTemplate redis;
    @MockitoBean KakaoOAuthService kakao;
    @MockitoBean ResetMailService mail;
    private static final AtomicInteger ADDRESS = new AtomicInteger(1);
    private static final AtomicInteger KAKAO_ID = new AtomicInteger((int)(System.nanoTime() % 1_000_000));

    @BeforeEach void stubAuthorizeUrl() {
        when(kakao.authorizeUrl(anyString(), eq(true))).thenAnswer(c -> "https://kauth.kakao.com/oauth/authorize?state=" + c.getArgument(0) + "&prompt=login");
    }

    String nextAddress() { int n=ADDRESS.getAndIncrement(); return "198.51.100."+(n%250+1); }
    User kakaoUser() {
        long id=9_000_000_000L+KAKAO_ID.getAndIncrement();
        return users.saveAndFlush(new User("kw-"+UUID.randomUUID().toString().substring(0,8),new BCryptPasswordEncoder().encode("x"),id));
    }
    Cookie session(User user) { return new Cookie(SharedSessionService.COOKIE, sessions.create(users.findById(user.getId()).orElseThrow())); }
    int count(String sql, Object... args) { return jdbc.queryForObject(sql,Integer.class,args); }
    int image(long owner) { return jdbc.queryForObject("INSERT INTO community_images(owner_id,mime,data) VALUES(?,'image/png',?) RETURNING id",Integer.class,owner,new byte[]{1}); }
    Map<String,Object> userRow(User u) { return jdbc.queryForMap("SELECT username,kakao_id,account_status,auth_version FROM users WHERE id=?",u.getId()); }

    record Started(String state, Cookie stateCookie) {}

    ResultActions start(Cookie session, Object body) throws Exception {
        var b=post("/api/auth/kakao/withdraw").with(r -> { r.setRemoteAddr(nextAddress()); return r; }).contentType("application/json").content(mapper.writeValueAsString(body));
        return mvc.perform(session==null ? b : b.cookie(session));
    }
    Started start(Cookie session) throws Exception {
        MvcResult r=start(session,Map.of("confirm",true)).andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn();
        String url=mapper.readTree(r.getResponse().getContentAsString()).get("url").asText();
        assertTrue(url.endsWith("&prompt=login"),url);
        Cookie c=r.getResponse().getCookie(KakaoStateService.COOKIE);
        assertEquals("/api/auth/kakao",c.getPath()); assertTrue(c.isHttpOnly());
        assertTrue(url.contains("state="+c.getValue()));
        return new Started(c.getValue(),new Cookie(KakaoStateService.COOKIE,c.getValue()));
    }
    MvcResult callback(Started s, Cookie session, String code, String error) throws Exception {
        var b=get("/api/auth/kakao/callback").param("state",s.state()).cookie(s.stateCookie());
        if (code!=null) b=b.param("code",code);
        if (error!=null) b=b.param("error",error);
        if (session!=null) b=b.cookie(session);
        return mvc.perform(b).andReturn();
    }
    static String location(MvcResult r) { assertEquals(302,r.getResponse().getStatus()); return r.getResponse().getHeader("Location"); }

    @Test void startRequiresSessionConsentAndAWithdrawableKakaoAccount() throws Exception {
        User k=kakaoUser(); Cookie c=session(k);
        start(null,Map.of("confirm",true)).andExpect(status().isUnauthorized());
        start(c,Map.of()).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("CONFIRM_REQUIRED"));
        // 일반(비밀번호) 계정은 카카오 경로로 탈퇴할 수 없고, 카카오 계정은 비밀번호 경로로 탈퇴할 수 없다.
        User p=users.saveAndFlush(new User("kw-pw-"+UUID.randomUUID().toString().substring(0,8),new BCryptPasswordEncoder().encode("password-1")));
        start(session(p),Map.of("confirm",true)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("NOT_KAKAO"));
        mvc.perform(post("/api/auth/withdraw").with(r -> { r.setRemoteAddr(nextAddress()); return r; }).cookie(c).contentType("application/json")
            .content("{\"password\":\"x\",\"confirm\":true}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("KAKAO_REAUTH_REQUIRED"));
        // 예약중 매물·운영자 권한이 있으면 카카오 재인증으로 보내기 전에 거절한다.
        int listing=jdbc.queryForObject("INSERT INTO parts_listings(seller_id,title,description,price,category,status,vehicle,region,contact) VALUES(?,'t','d',1,'wheels','reserved','A','R','c') RETURNING id",Integer.class,k.getId());
        start(c,Map.of("confirm",true)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("RESERVED_LISTINGS")).andExpect(jsonPath("$.reservedListings").value(1));
        jdbc.update("DELETE FROM parts_listings WHERE id=?",listing);
        jdbc.update("UPDATE users SET role='MANAGER' WHERE id=?",k.getId());
        start(c,Map.of("confirm",true)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("ADMIN_ROLE"));
        jdbc.update("UPDATE users SET role='USER' WHERE id=?",k.getId());
        // 통과하면 이 회원·세션에 묶인 5분 1회용 state. 시작만으로는 아무것도 바뀌지 않는다.
        Started s=start(c);
        String value=redis.opsForValue().get("revcc:oauth:state:"+s.state());
        assertEquals("withdraw:"+k.getId()+":0:"+KakaoStateService.hash(c.getValue()),value);
        long ttl=redis.getExpire("revcc:oauth:state:"+s.state());
        assertTrue(ttl>0 && ttl<=300,"ttl "+ttl);
        assertNotEquals("WITHDRAWN",userRow(k).get("account_status"));
        verify(kakao,never()).unlinkIfSameUser(anyString(),anyLong());
    }

    @Test void kakaoWithdrawalUnlinksThenRemovesMvpDataAndBlocksRejoin() throws Exception {
        User k=kakaoUser(), other=kakaoUser(); long id=k.getId(); long kakaoId=k.getKakaoId();
        Cookie c=session(k), otherDevice=session(k);
        // MVP 데이터: 현재 차량(공개·비공개 부품), 보관 차량(부품), 부품 사진, 글에도 첨부한 부품 사진, 부품에 연결된 후기 글.
        int imgCar=image(id), imgPublicPart=image(id), imgPrivatePart=image(id), imgArchivedPart=image(id), imgShared=image(id);
        int car=jdbc.queryForObject("INSERT INTO owner_vehicles(owner_id,model,year,image_id) VALUES(?,'Avante',2022,?) RETURNING id",Integer.class,id,imgCar);
        int old=jdbc.queryForObject("INSERT INTO owner_vehicles(owner_id,model,year,archived_at) VALUES(?,'K5',2015,NOW()) RETURNING id",Integer.class,id);
        int publicPart=jdbc.queryForObject("INSERT INTO vehicle_parts(vehicle_id,brand,name,installed_on,cost,image_ids) VALUES(?,'Michelin','PS4S',CURRENT_DATE,300000,?::int[]) RETURNING id",
            Integer.class,car,"{"+imgPublicPart+","+imgShared+"}");
        jdbc.update("INSERT INTO vehicle_parts(vehicle_id,brand,name,installed_on,image_ids,is_public) VALUES(?,'Bosch','Wiper',CURRENT_DATE,?::int[],false)",car,"{"+imgPrivatePart+"}");
        jdbc.update("INSERT INTO vehicle_parts(vehicle_id,brand,name,installed_on,removed_on,image_ids) VALUES(?,'Hankook','V12',CURRENT_DATE-10,CURRENT_DATE,?::int[])",old,"{"+imgArchivedPart+"}");
        int review=jdbc.queryForObject("INSERT INTO board_posts(title,content,author_id,image_ids,vehicle_id,part_id) VALUES('후기','본문',?,?::int[],?,?) RETURNING id",
            Integer.class,id,"{"+imgShared+"}",car,publicPart);
        jdbc.update("INSERT INTO member_profiles(user_id,bio,representative_vehicle_id) VALUES(?,'소개',?)",id,car);
        when(kakao.unlinkIfSameUser("good-code",kakaoId)).thenReturn(KakaoOAuthService.UnlinkResult.UNLINKED);

        Started s=start(c);
        MvcResult done=callback(s,c,"good-code",null);
        assertEquals("/",location(done));
        assertEquals(0,done.getResponse().getCookie(SharedSessionService.COOKIE).getMaxAge(),"세션 쿠키 삭제");
        assertEquals(0,done.getResponse().getCookie(KakaoStateService.COOKIE).getMaxAge(),"state 쿠키 삭제");
        verify(kakao).unlinkIfSameUser("good-code",kakaoId);

        Map<String,Object> row=userRow(k);
        assertEquals("WITHDRAWN",row.get("account_status")); assertNull(row.get("kakao_id")); assertEquals("withdrawn:"+id,row.get("username"));
        assertEquals(1L,((Number)row.get("auth_version")).longValue());
        assertFalse(Boolean.TRUE.equals(redis.hasKey("revcc:session:"+c.getValue())));
        mvc.perform(get("/api/auth/me").cookie(otherDevice)).andExpect(status().isUnauthorized());
        // 차량(현재·보관)·부품(공개·비공개·탈거)·프로필 삭제. 부품 사진은 지워지고, 글에도 첨부한 사진만 남는다.
        assertEquals(0,count("SELECT count(*)::int FROM owner_vehicles WHERE owner_id=?",id));
        assertEquals(0,count("SELECT count(*)::int FROM vehicle_parts WHERE vehicle_id IN (?,?)",car,old));
        assertEquals(0,count("SELECT count(*)::int FROM member_profiles WHERE user_id=?",id));
        assertEquals(Set.of(imgShared),new HashSet<>(jdbc.queryForList("SELECT id FROM community_images WHERE owner_id=?",Integer.class,id)));
        // 후기 글은 남고 차량·부품 연결만 끊긴다.
        Map<String,Object> post=jdbc.queryForMap("SELECT deleted,vehicle_id,part_id FROM board_posts WHERE id=?",review);
        assertEquals(Arrays.asList(false,null,null),Arrays.asList(post.get("deleted"),post.get("vehicle_id"),post.get("part_id")));
        // 재가입 제한: 아이디·카카오 회원번호(HMAC), 운영 기록.
        assertEquals(List.of("KAKAO","USERNAME"),jdbc.queryForList("SELECT identifier_type FROM withdrawal_blocks WHERE user_id=? ORDER BY identifier_type",String.class,id));
        assertEquals(List.of("SELF_WITHDRAW:ACTIVE"),jdbc.queryForList("SELECT action FROM admin_member_actions WHERE user_id=?",String.class,id));
        assertNotEquals("WITHDRAWN",userRow(other).get("account_status"));

        // 같은 콜백 재요청: 1회용 state라 400, 카카오를 다시 부르지 않는다.
        assertEquals(400,callback(s,c,"good-code",null).getResponse().getStatus());
        verify(kakao,times(1)).unlinkIfSameUser(anyString(),anyLong());
        // 같은 카카오 계정으로 다시 로그인하면 재가입 제한(409). 카카오 회원번호는 연결을 끊고 다시 이어도 유지된다(카카오 문서).
        String loginState=new KakaoStateService(redis,false).issue();
        when(kakao.exchange("rejoin")).thenReturn(new KakaoOAuthService.KakaoUser(kakaoId,"again"));
        mvc.perform(get("/api/auth/kakao/callback").param("code","rejoin").param("state",loginState).cookie(new Cookie(KakaoStateService.COOKIE,loginState)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.message").value(WithdrawalBlocks.MESSAGE));
        assertEquals(0,count("SELECT count(*)::int FROM users WHERE kakao_id=?",kakaoId));
    }

    @Test void callbackWithoutTheStartingSessionChangesNothingAndNeverCallsKakao() throws Exception {
        User k=kakaoUser(); Cookie c=session(k), otherDevice=session(k);
        Map<String,Object> before=userRow(k);
        // 세션 없음(만료) → 로그인 안내.
        assertEquals("/login?next=%2Fhome&kakaoWithdraw=SESSION_EXPIRED",location(callback(start(c),null,"code",null)));
        // 같은 회원의 다른 세션 → 시작한 세션이 아님.
        assertEquals("/home?kakaoWithdraw=SESSION_CHANGED",location(callback(start(c),otherDevice,"code",null)));
        // 다른 회원의 세션.
        assertEquals("/home?kakaoWithdraw=SESSION_CHANGED",location(callback(start(c),session(kakaoUser()),"code",null)));
        // 시작 뒤 다른 곳에서 비밀번호 변경·제재 등으로 세션 버전이 올라감 → 세션 자체가 무효.
        Started s=start(c);
        jdbc.update("UPDATE users SET auth_version=COALESCE(auth_version,0)+1 WHERE id=?",k.getId());
        assertEquals("/login?next=%2Fhome&kakaoWithdraw=SESSION_EXPIRED",location(callback(s,c,"code",null)));
        jdbc.update("UPDATE users SET auth_version=NULL WHERE id=?",k.getId());
        assertFalse(Boolean.TRUE.equals(redis.hasKey("revcc:session:"+c.getValue())),"버전이 다른 세션은 지워진다");
        c=session(k);
        // 카카오 화면에서 취소.
        assertEquals("/home?kakaoWithdraw=CANCELLED",location(callback(start(c),c,null,"access_denied")));
        verify(kakao,never()).unlinkIfSameUser(anyString(),anyLong());
        verify(kakao,never()).exchange(anyString());
        assertEquals(before,userRow(k));
    }

    @Test void differentKakaoAccountOrUnlinkFailureLeavesTheAccountUntouched(CapturedOutput output) throws Exception {
        User k=kakaoUser(); Cookie c=session(k); Map<String,Object> before=userRow(k);
        when(kakao.unlinkIfSameUser("other-account",k.getKakaoId())).thenReturn(KakaoOAuthService.UnlinkResult.DIFFERENT_ACCOUNT);
        assertEquals("/home?kakaoWithdraw=KAKAO_MISMATCH",location(callback(start(c),c,"other-account",null)));
        when(kakao.unlinkIfSameUser("kakao-down",k.getKakaoId())).thenThrow(new KakaoOAuthService.OAuthFailure("unlink HTTP 500 -1"));
        assertEquals("/home?kakaoWithdraw=UNLINK_FAILED",location(callback(start(c),c,"kakao-down",null)));
        assertEquals(before,userRow(k));
        assertEquals(0,count("SELECT count(*)::int FROM withdrawal_blocks WHERE user_id=?",k.getId()));
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk());
        assertTrue(output.getOut().contains("Kakao unlink for withdrawal failed: user="+k.getId()+" reason=unlink HTTP 500 -1"));
        assertFalse(output.getOut().contains(String.valueOf(k.getKakaoId())),"카카오 회원번호 원문은 로그에 남기지 않는다");
    }

    @Test void stateChangedAfterUnlinkRollsBackAndLogsAWarning(CapturedOutput output) throws Exception {
        User k=kakaoUser(); Cookie c=session(k); Map<String,Object> before=userRow(k);
        int listing=jdbc.queryForObject("INSERT INTO parts_listings(seller_id,title,description,price,category,status,vehicle,region,contact) VALUES(?,'t','d',1,'wheels','selling','A','R','010') RETURNING id",Integer.class,k.getId());
        int car=jdbc.queryForObject("INSERT INTO owner_vehicles(owner_id,model,year) VALUES(?,'Avante',2022) RETURNING id",Integer.class,k.getId());
        // 연결 끊기와 DB 처리 사이에 매물이 예약중으로 바뀐다(다른 탭·다른 기기).
        when(kakao.unlinkIfSameUser("code",k.getKakaoId())).thenAnswer(call -> {
            jdbc.update("UPDATE parts_listings SET status='reserved' WHERE id=?",listing);
            return KakaoOAuthService.UnlinkResult.UNLINKED;
        });
        assertEquals("/home?kakaoWithdraw=UNLINKED_NOT_WITHDRAWN&reason=RESERVED_LISTINGS",location(callback(start(c),c,"code",null)));
        assertEquals(before,userRow(k));
        assertEquals(1,count("SELECT count(*)::int FROM owner_vehicles WHERE id=?",car));
        assertEquals("010",jdbc.queryForObject("SELECT contact FROM parts_listings WHERE id=?",String.class,listing));
        assertEquals(0,count("SELECT count(*)::int FROM withdrawal_blocks WHERE user_id=?",k.getId()));
        assertTrue(output.getOut().contains("Kakao unlinked but withdrawal not completed: user="+k.getId()+" reason=RESERVED_LISTINGS"));
        // 관리자 회원 처리 기록에는 남기지 않는다(2026-11-03 결정: WARN 로그만).
        assertEquals(0,count("SELECT count(*)::int FROM admin_member_actions WHERE user_id=?",k.getId()));
        mvc.perform(get("/api/auth/me").cookie(c)).andExpect(status().isOk());
        // 거래를 정리하고 다시 시도하면(재동의 → 연결 끊기 → 탈퇴) 끝난다.
        jdbc.update("UPDATE parts_listings SET status='selling' WHERE id=?",listing);
        when(kakao.unlinkIfSameUser("retry",k.getKakaoId())).thenReturn(KakaoOAuthService.UnlinkResult.UNLINKED);
        assertEquals("/",location(callback(start(c),c,"retry",null)));
        assertEquals("WITHDRAWN",userRow(k).get("account_status"));
    }

    @Test void startIsRateLimitedPerAddress() throws Exception {
        User k=kakaoUser(); Cookie c=session(k);
        int limited=0;
        for (int i=0;i<12;i++) {
            int status=mvc.perform(post("/api/auth/kakao/withdraw").with(r -> { r.setRemoteAddr("192.0.2.77"); return r; })
                .cookie(c).contentType("application/json").content("{}")).andReturn().getResponse().getStatus();
            if (status==429) limited++;
        }
        assertTrue(limited>0,"IP당 분당 10회 제한");
    }

    @Test void twoTabsWithdrawingAtOnceSucceedOnce() throws Exception {
        User k=kakaoUser(); Cookie c=session(k);
        when(kakao.unlinkIfSameUser(anyString(),eq(k.getKakaoId()))).thenReturn(KakaoOAuthService.UnlinkResult.UNLINKED);
        Started a=start(c), b=start(c);
        CountDownLatch go=new CountDownLatch(1);
        List<String> locations;
        try (ExecutorService pool=Executors.newFixedThreadPool(2)) {
            Future<String> fa=pool.submit(() -> { go.await(); return location(callback(a,c,"code-a",null)); });
            Future<String> fb=pool.submit(() -> { go.await(); return location(callback(b,c,"code-b",null)); });
            go.countDown();
            locations=List.of(fa.get(30,TimeUnit.SECONDS),fb.get(30,TimeUnit.SECONDS));
        }
        // 늦게 끝난 탭도 이미 탈퇴된 계정이면 완료(/)로 안내한다. 탈퇴 처리 자체는 한 번뿐이다.
        assertEquals(List.of("/","/"),locations);
        assertEquals("WITHDRAWN",userRow(k).get("account_status"));
        assertEquals(1,count("SELECT count(*)::int FROM admin_member_actions WHERE user_id=? AND action LIKE 'SELF_WITHDRAW%'",k.getId()));
    }
}
