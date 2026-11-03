package com.revcc.app;

import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import java.time.Duration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** 카카오 OAuth state 발급/검증. Redis가 신뢰 저장소, 쿠키는 브라우저 바인딩용 이중 확인. */
class KakaoStateServiceTest {

    @Test void validStateMatchingCookieIsAcceptedAndConsumedOnce() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        String state = "a".repeat(43);
        // 첫 조회는 유효, 두 번째(재사용 시도)는 이미 삭제되어 null.
        when(values.getAndDelete("revcc:oauth:state:" + state)).thenReturn("1", (String) null);
        KakaoStateService service = new KakaoStateService(redis, false);

        assertTrue(service.verify(state, state), "정상 state는 로그인 진행이 허용되어야 한다");
        assertFalse(service.verify(state, state), "이미 사용한 state는 재사용을 거부해야 한다");
    }

    @Test void missingStateIsRejectedWithoutTouchingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        KakaoStateService service = new KakaoStateService(redis, false);
        String cookieOnly = "a".repeat(43);

        assertFalse(service.verify(null, cookieOnly), "state 파라미터 없음은 거부되어야 한다");
        assertFalse(service.verify(cookieOnly, null), "state 쿠키 없음도 거부되어야 한다");
        verifyNoInteractions(redis);
    }

    @Test void stateNotMatchingCookieIsRejected() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        KakaoStateService service = new KakaoStateService(redis, false);

        // 공격자가 자신의 정상 state를 피해자 브라우저에 재생하는 시나리오: 쿠키는 다르므로 거부.
        assertFalse(service.verify("e".repeat(43), "f".repeat(43)));
        verify(values, never()).getAndDelete(anyString());
    }

    @Test void expiredStateIsRejected() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        String state = "c".repeat(43);
        // TTL이 지나 Redis에서 이미 사라진 상태를 흉내낸다.
        when(values.getAndDelete("revcc:oauth:state:" + state)).thenReturn(null);
        KakaoStateService service = new KakaoStateService(redis, false);

        assertFalse(service.verify(state, state), "만료된 state는 거부되어야 한다");
    }

    @Test void malformedStateIsRejectedWithoutTouchingRedis() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        KakaoStateService service = new KakaoStateService(redis, false);

        assertFalse(service.verify("too-short", "too-short"));
        verifyNoInteractions(redis);
    }

    @Test void issueStoresThirtyTwoByteTokenWithFiveMinuteTtl() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        KakaoStateService service = new KakaoStateService(redis, false);

        String state = service.issue();

        assertTrue(state.matches("[A-Za-z0-9_-]{43}"), "32바이트 SecureRandom → base64url 43자여야 한다");
        verify(values).set(eq("revcc:oauth:state:" + state), eq("1"), eq(Duration.ofMinutes(5)));
    }

    @Test void cookieIsHttpOnlyAndScopedToKakaoEndpoints() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        KakaoStateService secureService = new KakaoStateService(redis, true);
        String cookie = secureService.cookie("d".repeat(43));

        assertTrue(cookie.contains("HttpOnly"));
        assertTrue(cookie.contains("Secure"));
        assertTrue(cookie.contains("Path=/api/auth/kakao"));
        assertFalse(cookie.toLowerCase().contains("samesite=none"));
    }

    // LATER-1: 탈퇴용 state는 시작한 회원·세션에 묶이고, 로그인으로는 쓸 수 없다.
    @Test void withdrawStateIsBoundToTheStartingSessionAndNeverCountsAsLogin() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        KakaoStateService service = new KakaoStateService(redis, false);
        var session = new SharedSessionService.SessionUser(5L, "kakao", "USER", 3);
        String token = "t".repeat(43);
        String state = service.issueWithdraw(session, token);
        var stored = org.mockito.ArgumentCaptor.forClass(String.class);
        verify(values).set(eq("revcc:oauth:state:" + state), stored.capture(), eq(Duration.ofMinutes(5)));
        assertEquals("withdraw:5:3:" + KakaoStateService.hash(token), stored.getValue());
        assertFalse(stored.getValue().contains(token), "세션 토큰 원문은 저장하지 않는다");

        when(values.getAndDelete("revcc:oauth:state:" + state)).thenReturn(stored.getValue(), stored.getValue());
        var consumed = service.consume(state, state);
        assertEquals(KakaoStateService.Purpose.WITHDRAW, consumed.purpose());
        assertTrue(consumed.startedBy(session, token));
        assertFalse(consumed.startedBy(session, "u".repeat(43)), "다른 세션 토큰");
        assertFalse(consumed.startedBy(new SharedSessionService.SessionUser(6L, "x", "USER", 3), token), "다른 회원");
        assertFalse(consumed.startedBy(new SharedSessionService.SessionUser(5L, "kakao", "USER", 4), token), "세션 버전이 바뀜");
        assertFalse(service.verify(state, state), "탈퇴용 state로는 로그인 콜백을 통과할 수 없다");
    }

    @Test void loginStateIsNeverStartedByAnySessionAndUnknownValuesAreRejected() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked") ValueOperations<String, String> values = mock(ValueOperations.class);
        when(redis.opsForValue()).thenReturn(values);
        KakaoStateService service = new KakaoStateService(redis, false);
        String state = "b".repeat(43);
        when(values.getAndDelete("revcc:oauth:state:" + state)).thenReturn("1", "withdraw:5:3:short", "other", "withdraw:x:3:" + "a".repeat(64));
        var login = service.consume(state, state);
        assertEquals(KakaoStateService.Purpose.LOGIN, login.purpose());
        assertFalse(login.startedBy(new SharedSessionService.SessionUser(0L, "x", "USER", 0), "t".repeat(43)),
            "로그인용 state로는 탈퇴 분기를 통과할 수 없다");
        assertNull(service.consume(state, state));
        assertNull(service.consume(state, state));
        assertNull(service.consume(state, state));
    }
}
