package com.revcc.app;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

/** 카카오 로그인: 인가 코드를 액세스 토큰으로 교환하고 사용자 정보를 조회한다.
 * 회원 탈퇴(LATER-1)는 같은 교환·조회 뒤 그 사용자 토큰으로 앱 연결을 끊는다(Admin 키는 쓰지 않는다).
 * 액세스 토큰은 이 클래스 밖으로 나가지 않고 저장하지도 않는다. */
@Service
public class KakaoOAuthService {
    // 카카오가 응답하지 않을 때 로그인 요청 스레드가 무기한 묶이지 않도록 연결·요청 시간을 제한한다(NOW-4).
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(3);
    static final Duration REQUEST_TIMEOUT = Duration.ofSeconds(5);
    private final HttpClient http;
    private final ObjectMapper mapper;
    private final String clientId;
    private final String clientSecret;
    private final String redirectUri;

    @org.springframework.beans.factory.annotation.Autowired
    public KakaoOAuthService(ObjectMapper mapper,
            @Value("${app.kakao.client-id:}") String clientId,
            @Value("${app.kakao.client-secret:}") String clientSecret,
            @Value("${app.kakao.redirect-uri}") String redirectUri) {
        this(mapper, clientId, clientSecret, redirectUri, HttpClient.newBuilder().connectTimeout(CONNECT_TIMEOUT).build());
    }

    // 테스트에서 카카오 응답을 흉내 내기 위한 생성자.
    KakaoOAuthService(ObjectMapper mapper, String clientId, String clientSecret, String redirectUri, HttpClient http) {
        this.http = http;
        this.mapper = mapper;
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    public String authorizeUrl(String state) {
        return authorizeUrl(state, false);
    }

    /** reauthenticate=true면 prompt=login: 이미 카카오에 로그인돼 있어도 카카오계정 로그인을 다시 받는다(탈퇴 재인증). */
    public String authorizeUrl(String state, boolean reauthenticate) {
        // scope를 명시해야 카카오 동의 화면에 닉네임 제공이 뜬다. 콘솔의 동의항목에서도
        // "닉네임"이 켜져 있어야 실제 값이 내려온다(꺼져 있으면 이 값과 무관하게 비어 온다).
        // state는 로그인 CSRF/계정 혼동을 막는 1회용 토큰이다(KakaoStateService가 발급/검증).
        return "https://kauth.kakao.com/oauth/authorize?client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(redirectUri) + "&response_type=code&scope=profile_nickname"
            + "&state=" + encode(state) + (reauthenticate ? "&prompt=login" : "");
    }

    public record KakaoUser(long id, String nickname) {}

    public KakaoUser exchange(String code) throws Exception {
        return profile(accessToken(code));
    }

    public enum UnlinkResult { UNLINKED, DIFFERENT_ACCOUNT }

    /**
     * 탈퇴 재인증: 인가 코드로 토큰을 받고, 그 카카오 사용자가 expectedKakaoId일 때만 앱 연결을 끊는다.
     * 다른 카카오 계정이면 끊지 않고 DIFFERENT_ACCOUNT. 교환·조회·연결 끊기의 HTTP 실패는 OAuthFailure(허용된 코드만)이고,
     * 연결 끊기 응답의 회원번호가 다르면 실패로 본다. 응답을 못 받은 경우(timeout)는 실제로 끊겼을 수도 있다 — 호출자는 실패로 처리한다.
     */
    public UnlinkResult unlinkIfSameUser(String code, long expectedKakaoId) throws Exception {
        String accessToken = accessToken(code);
        if (profile(accessToken).id() != expectedKakaoId) return UnlinkResult.DIFFERENT_ACCOUNT;
        HttpRequest unlinkRequest = HttpRequest.newBuilder(URI.create("https://kapi.kakao.com/v1/user/unlink"))
            .timeout(REQUEST_TIMEOUT)
            .header("Authorization", "Bearer " + accessToken)
            .POST(HttpRequest.BodyPublishers.noBody()).build();
        HttpResponse<String> unlinkResponse = http.send(unlinkRequest, HttpResponse.BodyHandlers.ofString());
        if (unlinkResponse.statusCode() != 200)
            throw oauthFailure("unlink", unlinkResponse);
        if (mapper.readTree(unlinkResponse.body()).path("id").asLong(-1) != expectedKakaoId)
            throw new OAuthFailure("unlink HTTP 200 id-mismatch");
        return UnlinkResult.UNLINKED;
    }

    private String accessToken(String code) throws Exception {
        String tokenBody = "grant_type=authorization_code"
            + "&client_id=" + encode(clientId)
            + "&redirect_uri=" + encode(redirectUri)
            + "&code=" + encode(code);
        if (!clientSecret.isBlank()) tokenBody += "&client_secret=" + encode(clientSecret);
        HttpRequest tokenRequest = HttpRequest.newBuilder(URI.create("https://kauth.kakao.com/oauth/token"))
            .timeout(REQUEST_TIMEOUT)
            .header("Content-Type", "application/x-www-form-urlencoded")
            .POST(HttpRequest.BodyPublishers.ofString(tokenBody)).build();
        HttpResponse<String> tokenResponse = http.send(tokenRequest, HttpResponse.BodyHandlers.ofString());
        if (tokenResponse.statusCode() != 200)
            throw oauthFailure("token", tokenResponse);
        return mapper.readTree(tokenResponse.body()).get("access_token").asText();
    }

    private KakaoUser profile(String accessToken) throws Exception {
        HttpRequest profileRequest = HttpRequest.newBuilder(URI.create("https://kapi.kakao.com/v2/user/me"))
            .timeout(REQUEST_TIMEOUT)
            .header("Authorization", "Bearer " + accessToken).GET().build();
        HttpResponse<String> profileResponse = http.send(profileRequest, HttpResponse.BodyHandlers.ofString());
        if (profileResponse.statusCode() != 200)
            throw oauthFailure("profile", profileResponse);
        JsonNode root = mapper.readTree(profileResponse.body());
        long id = root.get("id").asLong();
        String nickname = root.path("properties").path("nickname").asText(null);
        if (nickname == null || nickname.isBlank())
            nickname = root.path("kakao_account").path("profile").path("nickname").asText("카카오사용자");
        return new KakaoUser(id, nickname);
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private OAuthFailure oauthFailure(String stage, HttpResponse<String> response) {
        String code = "unknown";
        try {
            JsonNode body = mapper.readTree(response.body());
            // kauth(토큰)는 error_code "KOE000", kapi(사용자 조회·연결 끊기)는 숫자 code(-401 등)를 준다.
            String candidate = body.path("error_code").asText("");
            if (candidate.matches("KOE[0-9]{3}")) code = candidate;
            else if (body.path("code").isInt() && body.path("code").asText().matches("-?[0-9]{1,4}")) code = body.path("code").asText();
        } catch (Exception ignored) { }
        return new OAuthFailure(stage + " HTTP " + response.statusCode() + " " + code);
    }

    // 원문 응답에는 인증 정보가 포함될 수 있으므로 허용된 오류 코드만 기록한다.
    public static class OAuthFailure extends RuntimeException {
        OAuthFailure(String message) { super(message); }
    }
}
