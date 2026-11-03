package com.revcc.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/** authorizeUrl이 state를 카카오 인가 URL에 실제로 실어 보내는지 회귀 검증한다(P0-1). 탈퇴 재인증·연결 끊기(LATER-1)도 본다. */
class KakaoOAuthServiceTest {
    @Test void authorizeUrlIncludesGivenState() {
        KakaoOAuthService service = new KakaoOAuthService(new ObjectMapper(), "client-id", "", "https://rev.cc/api/auth/kakao/callback");
        String url = service.authorizeUrl("test-state-value");
        assertTrue(url.contains("state=test-state-value"), url);
        assertTrue(url.contains("client_id=client-id"), url);
        assertTrue(url.contains("redirect_uri=https%3A%2F%2Frev.cc%2Fapi%2Fauth%2Fkakao%2Fcallback"), url);
        assertFalse(url.contains("prompt="), "로그인은 카카오 로그인 화면을 강제하지 않는다");
    }

    @Test void withdrawalAuthorizeUrlForcesKakaoLogin() {
        KakaoOAuthService service = new KakaoOAuthService(new ObjectMapper(), "client-id", "", "https://rev.cc/api/auth/kakao/callback");
        assertTrue(service.authorizeUrl("s", true).endsWith("&state=s&prompt=login"));
    }

    @SuppressWarnings("unchecked")
    private static HttpResponse<String> response(int status, String body) {
        HttpResponse<String> r = mock(HttpResponse.class);
        when(r.statusCode()).thenReturn(status);
        when(r.body()).thenReturn(body);
        return r;
    }

    private record Fake(KakaoOAuthService service, List<HttpRequest> requests) {}

    @SuppressWarnings("unchecked")
    private static Fake fake(HttpResponse<String>... responses) throws Exception {
        HttpClient http = mock(HttpClient.class);
        List<HttpRequest> requests = new ArrayList<>();
        // 보낸 요청을 기록하고 준비한 응답을 순서대로 돌려준다.
        var queue = new java.util.ArrayDeque<>(List.of(responses));
        doAnswer(call -> { requests.add(call.getArgument(0)); return queue.poll(); }).when(http).send(any(HttpRequest.class), any(HttpResponse.BodyHandler.class));
        return new Fake(new KakaoOAuthService(new ObjectMapper(), "client-id", "", "https://rev.cc/cb", http), requests);
    }

    @Test void unlinksOnlyTheExpectedKakaoUserWithTheUserToken() throws Exception {
        Fake f = fake(response(200, "{\"access_token\":\"secret-token\"}"), response(200, "{\"id\":42}"), response(200, "{\"id\":42}"));
        assertEquals(KakaoOAuthService.UnlinkResult.UNLINKED, f.service().unlinkIfSameUser("code", 42));
        assertEquals(3, f.requests().size());
        HttpRequest unlink = f.requests().get(2);
        assertEquals("https://kapi.kakao.com/v1/user/unlink", unlink.uri().toString());
        assertEquals("POST", unlink.method());
        assertEquals("Bearer secret-token", unlink.headers().firstValue("Authorization").orElseThrow());
        assertTrue(unlink.timeout().isPresent());
    }

    @Test void differentKakaoAccountIsNotUnlinked() throws Exception {
        Fake f = fake(response(200, "{\"access_token\":\"secret-token\"}"), response(200, "{\"id\":7}"));
        assertEquals(KakaoOAuthService.UnlinkResult.DIFFERENT_ACCOUNT, f.service().unlinkIfSameUser("code", 42));
        assertEquals(2, f.requests().size(), "연결 끊기 요청을 보내지 않는다");
    }

    @Test void unlinkFailureKeepsOnlyTheAllowedErrorCode() throws Exception {
        Fake f = fake(response(200, "{\"access_token\":\"secret-token\"}"), response(200, "{\"id\":42}"),
            response(401, "{\"msg\":\"this access token does not exist secret-token\",\"code\":-401}"));
        var e = assertThrows(KakaoOAuthService.OAuthFailure.class, () -> f.service().unlinkIfSameUser("code", 42));
        assertEquals("unlink HTTP 401 -401", e.getMessage());
        assertFalse(e.getMessage().contains("secret-token"));
    }

    @Test void tokenFailureStopsBeforeProfileAndUnlink() throws Exception {
        Fake f = fake(response(400, "{\"error\":\"invalid_grant\",\"error_code\":\"KOE320\"}"));
        var e = assertThrows(KakaoOAuthService.OAuthFailure.class, () -> f.service().unlinkIfSameUser("code", 42));
        assertEquals("token HTTP 400 KOE320", e.getMessage());
        assertEquals(1, f.requests().size());
    }

    @Test void unlinkResponseForAnotherUserIsAFailure() throws Exception {
        Fake f = fake(response(200, "{\"access_token\":\"t\"}"), response(200, "{\"id\":42}"), response(200, "{\"id\":43}"));
        assertThrows(KakaoOAuthService.OAuthFailure.class, () -> f.service().unlinkIfSameUser("code", 42));
    }
}
