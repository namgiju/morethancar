package com.revcc.app;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;

/** 카카오 로그인·탈퇴 재인증의 시작~콜백 사이의 OAuth CSRF(로그인 CSRF/계정 혼동)를 막는 1회용 state.
 * Redis를 신뢰 저장소로 쓰고(revcc:session:*과 같은 계약), 같은 값을 단기 HttpOnly 쿠키로
 * 요청 브라우저에 묶어 "공격자가 자기 자신의 유효한 state를 피해자에게 재생"하는 공격을 막는다.
 *
 * Redis 값이 용도를 정한다(LATER-1). 로그인은 "1"(배포 전 발급된 state와 같은 값), 탈퇴는
 * "withdraw:<회원 id>:<세션 버전>:<세션 토큰 SHA-256>"로 시작한 회원·세션에 묶는다. 그래서 로그인용 state로는
 * 탈퇴 분기에 들어갈 수 없고, 탈퇴용 state는 시작한 세션이 아니면 쓸 수 없다. 세션 토큰 원문은 저장하지 않는다. */
@Service
public class KakaoStateService {
    public static final String COOKIE = "REVCC_OAUTH_STATE";
    private static final String KEY_PREFIX = "revcc:oauth:state:";
    private static final String LOGIN = "1";
    private static final String WITHDRAW = "withdraw:";
    private static final Duration TTL = Duration.ofMinutes(5);

    private final StringRedisTemplate redis;
    private final boolean secure;
    private final SecureRandom random = new SecureRandom();

    public KakaoStateService(StringRedisTemplate redis, @Value("${app.session.secure:false}") boolean secure) {
        this.redis = redis;
        this.secure = secure;
    }

    public enum Purpose { LOGIN, WITHDRAW }

    /** 콜백이 state를 소비한 결과. 탈퇴용이면 시작한 회원·세션 버전·세션 토큰 해시가 들어 있다. */
    public record Consumed(Purpose purpose, long userId, long sessionVersion, String sessionHash) {
        static final Consumed LOGIN_STATE = new Consumed(Purpose.LOGIN, 0, 0, null);
        /** 콜백의 현재 세션이 탈퇴를 시작한 그 세션인지. */
        public boolean startedBy(SharedSessionService.SessionUser session, String sessionToken) {
            return purpose == Purpose.WITHDRAW && session.id() == userId && session.version() == sessionVersion
                && MessageDigest.isEqual(sessionHash.getBytes(StandardCharsets.US_ASCII),
                    hash(sessionToken).getBytes(StandardCharsets.US_ASCII));
        }
    }

    public String issue() {
        return store(LOGIN);
    }

    public String issueWithdraw(SharedSessionService.SessionUser session, String sessionToken) {
        return store(WITHDRAW + session.id() + ":" + session.version() + ":" + hash(sessionToken));
    }

    private String store(String value) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        String state = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        redis.opsForValue().set(KEY_PREFIX + state, value, TTL);
        return state;
    }

    /** state가 형식에 맞고, 쿠키 값과 일치하고, Redis에 아직 살아있으면 즉시 폐기(1회용)하고 그 용도를 돌려준다.
     * 없음/불일치/만료/재사용/알 수 없는 값은 모두 null — 어떤 경우인지는 호출자에게 구분해 알려주지 않는다. */
    public Consumed consume(String state, String cookieState) {
        if (state == null || cookieState == null || !valid(state) || !state.equals(cookieState)) return null;
        String value = redis.opsForValue().getAndDelete(KEY_PREFIX + state);
        if (LOGIN.equals(value)) return Consumed.LOGIN_STATE;
        if (value == null || !value.startsWith(WITHDRAW)) return null;
        String[] parts = value.substring(WITHDRAW.length()).split(":");
        if (parts.length != 3 || !parts[0].matches("[0-9]{1,18}") || !parts[1].matches("[0-9]{1,18}") || !parts[2].matches("[0-9a-f]{64}"))
            return null;
        return new Consumed(Purpose.WITHDRAW, Long.parseLong(parts[0]), Long.parseLong(parts[1]), parts[2]);
    }

    /** 로그인 전용 검증(기존 호출 호환). 탈퇴용 state도 소비되지만 로그인으로는 인정하지 않는다. */
    public boolean verify(String state, String cookieState) {
        Consumed consumed = consume(state, cookieState);
        return consumed != null && consumed.purpose() == Purpose.LOGIN;
    }

    public String cookie(String state) {
        return ResponseCookie.from(COOKIE, state).path("/api/auth/kakao").httpOnly(true)
            .sameSite("Lax").secure(secure).maxAge(TTL).build().toString();
    }

    public String clearCookie() {
        return ResponseCookie.from(COOKIE, "").path("/api/auth/kakao").httpOnly(true)
            .sameSite("Lax").secure(secure).maxAge(Duration.ZERO).build().toString();
    }

    private boolean valid(String value) {
        return value.matches("[A-Za-z0-9_-]{43}");
    }

    static String hash(String token) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest((token == null ? "" : token).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}
