package com.revcc.app;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.function.Predicate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * 일반 계정 회원 탈퇴(STEP 10-impl-C, soft withdrawal). users 행은 남기고 한 트랜잭션에서 데이터를 정리한 뒤 WITHDRAWN으로 바꾼다.
 * 중간에 실패하면 전부 롤백된다. Redis 세션 정리는 커밋 후 호출자(AuthController)가 하며, 다른 기기의 세션은 커밋과 함께
 * 올라간 auth_version 때문에 Spring(SharedSessionService)·board(app.js) 모두에서 즉시 거부된다.
 *
 * 남기는 것: 게시글·댓글("탈퇴한 회원"으로 표시), 타인 차고에 쓴 방명록, 본인이 한 신고, 판매완료 매물(연락처 제외),
 *           공개 글·남는 매물이 쓰는 사진, moderation_logs(대상 아이디만 익명화), admin_member_actions, 정지 종료일.
 * 지우는 것: 차고(현재·이전(보관) 차량, 정비기록·부품 이력·자동차등록증·인증), 프로필, 내 차고의 방명록, 좋아요·북마크·찜·받은 알림,
 *           참조 없는 내 사진(부품 사진 포함). 글에 연결된 부품(part_id)은 차량 삭제로 NULL이 되고 글은 남는다.
 * 판매중 매물은 비공개(closed)로 닫고 연락처와 찜을 지운다. 예약중 매물이 있으면 탈퇴하지 않는다(409).
 * 카카오 계정은 비밀번호 대신 카카오 재인증과 앱 연결 끊기를 거친다(LATER-1): AuthController가 precheckKakao(읽기 전용) →
 * 카카오 재인증·연결 끊기(트랜잭션 밖) → withdrawKakao(짧은 트랜잭션에서 모든 조건 재검사) 순서로 부른다.
 */
@Service
public class WithdrawalService {
    static final Duration COOLDOWN = Duration.ofDays(30);
    private final UserRepository users;
    private final JdbcTemplate jdbc;
    private final WithdrawalBlocks blocks;
    private final AdminMemberActionRepository logs;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();

    public WithdrawalService(UserRepository users, JdbcTemplate jdbc, WithdrawalBlocks blocks, AdminMemberActionRepository logs) {
        this.users = users; this.jdbc = jdbc; this.blocks = blocks; this.logs = logs;
    }

    /** 응답 본문의 code는 화면이 안내 문구를 고르는 데 쓴다. */
    public static final class Refusal extends ResponseStatusException {
        private final Map<String, Object> body;
        Refusal(HttpStatus status, String code, String message, Map<String, Object> extra) {
            super(status, message);
            var map = new java.util.LinkedHashMap<String, Object>(extra);
            map.put("code", code); map.put("message", message);
            body = map;
        }
        Refusal(HttpStatus status, String code, String message) { this(status, code, message, Map.of()); }
        public Map<String, Object> body() { return body; }
    }

    /** 탈퇴 화면용: 확인 방식과 먼저 정리해야 할 예약중 매물 수. */
    @Transactional(readOnly = true)
    public Map<String, Object> info(long userId) {
        User user = users.findById(userId).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        return Map.of("method", user.getKakaoId() != null ? "KAKAO" : "PASSWORD",
            "admin", user.isOperator(), "reservedListings", reservedListings(userId), "available", blocks.configured());
    }

    private int reservedListings(long userId) {
        Integer count = jdbc.queryForObject("SELECT count(*)::int FROM parts_listings WHERE seller_id=? AND status='reserved'", Integer.class, userId);
        return count == null ? 0 : count;
    }

    @Transactional
    public void withdraw(long userId, long sessionVersion, String password, Predicate<String> passwordMatches, Runnable onWrongPassword) {
        // 비밀값 없이는 재가입 제한을 기록할 수 없다. 제한 없이 탈퇴시키지 않는다.
        if (!blocks.configured()) throw WithdrawalBlocks.unavailable();
        // 1. 회원 행을 잠그고 최신 상태로 판단한다. 같은 회원의 동시 탈퇴 요청은 여기서 한 줄로 선다(뒤 요청은 401).
        User user = current(users.lockById(userId), sessionVersion);
        if (user.getKakaoId() != null)
            throw new Refusal(HttpStatus.BAD_REQUEST, "KAKAO_REAUTH_REQUIRED", "카카오 계정은 카카오 재인증으로 탈퇴해야 합니다.");
        requireNotOperator(user);
        if (password == null || password.isEmpty())
            throw new Refusal(HttpStatus.BAD_REQUEST, "PASSWORD_REQUIRED", "현재 비밀번호를 입력해주세요.");
        if (!passwordMatches.test(user.getPassword())) {
            onWrongPassword.run();
            throw new Refusal(HttpStatus.FORBIDDEN, "WRONG_PASSWORD", "비밀번호가 올바르지 않습니다.");
        }
        lockListingsAndRequireNoReserved(userId);
        purge(user);
    }

    /**
     * 카카오 탈퇴 시작·콜백의 사전 검사(읽기 전용, 잠금 없음). 카카오 재인증이나 연결 끊기 전에 이미 탈퇴할 수 없는 상태를 걸러
     * 쓸데없이 카카오 연결을 끊지 않게 한다. 통과해도 최종 판단은 withdrawKakao가 잠금 아래에서 다시 한다. 반환값은 카카오 회원번호.
     */
    @Transactional(readOnly = true)
    public long precheckKakao(long userId, long sessionVersion) {
        if (!blocks.configured()) throw WithdrawalBlocks.unavailable();
        User user = current(users.findById(userId), sessionVersion);
        if (user.getKakaoId() == null)
            throw new Refusal(HttpStatus.BAD_REQUEST, "NOT_KAKAO", "카카오 계정만 카카오 재인증으로 탈퇴할 수 있습니다.");
        requireNotOperator(user);
        int reserved = reservedListings(userId);
        if (reserved > 0) throw reservedRefusal(reserved);
        return user.getKakaoId();
    }

    /**
     * 카카오 계정 탈퇴의 DB 처리. 카카오 연결 끊기가 성공한 뒤에만 부른다. 카카오 HTTP는 이 트랜잭션 밖이라 잠금·커넥션을 오래 쥐지 않는다.
     * 연결 끊기 이후 바뀐 상태(세션 버전, 다른 카카오 계정으로 바뀜, 권한 부여, 예약중 매물)는 여기서 거절되고 전부 롤백된다.
     */
    @Transactional
    public void withdrawKakao(long userId, long sessionVersion, long kakaoId) {
        if (!blocks.configured()) throw WithdrawalBlocks.unavailable();
        User user = current(users.lockById(userId), sessionVersion);
        if (user.getKakaoId() == null || user.getKakaoId() != kakaoId)
            throw new Refusal(HttpStatus.CONFLICT, "KAKAO_MISMATCH", "이 계정에 연결된 카카오 계정이 아닙니다.");
        requireNotOperator(user);
        lockListingsAndRequireNoReserved(userId);
        purge(user);
    }

    private User current(java.util.Optional<User> found, long sessionVersion) {
        User user = found.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다."));
        if (user.isWithdrawn() || user.getAuthVersion() != sessionVersion)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "로그인이 필요합니다.");
        return user;
    }

    // 관리자(ADMIN)와 콘텐츠 운영자(MANAGER)는 권한을 먼저 해제해야 탈퇴할 수 있다(코드는 기존 ADMIN_ROLE 유지).
    private static void requireNotOperator(User user) {
        if (user.isOperator())
            throw new Refusal(HttpStatus.CONFLICT, "ADMIN_ROLE", "관리자·운영자 권한을 먼저 해제해야 탈퇴할 수 있습니다.");
    }

    private static Refusal reservedRefusal(int reserved) {
        return new Refusal(HttpStatus.CONFLICT, "RESERVED_LISTINGS",
            "예약중인 매물이 " + reserved + "개 있습니다. 거래를 마치거나 판매중으로 바꾼 뒤 탈퇴해주세요.", Map.of("reservedListings", reserved));
    }

    // 2. 내 매물을 잠근다. 같은 시각의 상태 변경(판매중 → 예약중)은 이 트랜잭션이 끝날 때까지 기다린다.
    private void lockListingsAndRequireNoReserved(long userId) {
        jdbc.queryForList("SELECT id FROM parts_listings WHERE seller_id=? FOR UPDATE", Long.class, userId);
        int reserved = reservedListings(userId);
        if (reserved > 0) throw reservedRefusal(reserved);
    }

    /** 3~9단계: 잠금과 모든 검사를 마친 회원의 데이터를 정리하고 WITHDRAWN으로 바꾼다. 호출자의 트랜잭션 안에서만 부른다. */
    private void purge(User user) {
        long userId = user.getId();
        Instant now = Instant.now();
        // 3. 재가입 제한. 원문이 지워지기 전에 HMAC을 만든다. 이메일이 없는 기존 계정은 아이디만 기록된다(문서화된 한계).
        recordBlocks(user, now);
        // 4. 차고: 현재·보관 차량 모두(정비기록·부품 이력·자동차등록증·인증은 CASCADE, 게시글 vehicle_id·part_id는 SET NULL),
        //    프로필, 내 차고의 방명록.
        //    타인 차고에 내가 쓴 방명록(author_id=나)은 남는다.
        jdbc.update("DELETE FROM garage_guestbook WHERE owner_id=?", userId);
        jdbc.update("DELETE FROM member_profiles WHERE user_id=?", userId);
        jdbc.update("DELETE FROM owner_vehicles WHERE owner_id=?", userId);
        // 5. 매물: 판매중은 비공개로 닫고 연락처·찜을 지운다. 판매완료는 거래 기록으로 남기고 연락처만 지운다(지역·사진 유지).
        jdbc.update("DELETE FROM parts_favorites WHERE listing_id IN (SELECT id FROM parts_listings WHERE seller_id=? AND status='selling')", userId);
        jdbc.update("UPDATE parts_listings SET status='closed',closed_at=NOW(),contact='',updated_at=NOW() WHERE seller_id=? AND status='selling'", userId);
        jdbc.update("UPDATE parts_listings SET contact='' WHERE seller_id=? AND status='sold'", userId);
        // 6. 개인 활동: 내 좋아요·북마크·찜, 내가 받은 알림. 내가 유발한 타인의 알림과 내가 한 신고는 남는다.
        jdbc.update("DELETE FROM board_likes WHERE user_id=?", userId);
        jdbc.update("DELETE FROM board_bookmarks WHERE user_id=?", userId);
        jdbc.update("DELETE FROM parts_favorites WHERE user_id=?", userId);
        jdbc.update("DELETE FROM community_notifications WHERE user_id=?", userId);
        // 7. 사진: 어디에서도 참조하지 않는 내 사진만 지운다. 삭제된 글(작성자 삭제 원문 보존)·닫힌 매물의 참조도 참조로 센다.
        //    부품 사진은 4단계에서 부품이 지워져 여기서 함께 정리된다(글에도 첨부한 사진은 글 때문에 남는다). 부품 참조도 방어적으로 센다.
        //    다른 회원은 내 사진을 참조할 수 없다(첨부는 본인 사진만 허용, owned-images.js).
        jdbc.update("""
            DELETE FROM community_images i WHERE i.owner_id=?
            AND NOT EXISTS(SELECT 1 FROM board_posts p WHERE p.image_ids @> ARRAY[i.id])
            AND NOT EXISTS(SELECT 1 FROM parts_listings l WHERE l.image_ids @> ARRAY[i.id])
            AND NOT EXISTS(SELECT 1 FROM member_profiles m WHERE m.avatar_image_id=i.id OR m.cover_image_id=i.id)
            AND NOT EXISTS(SELECT 1 FROM owner_vehicles v WHERE v.image_id=i.id)
            AND NOT EXISTS(SELECT 1 FROM vehicle_parts vp WHERE vp.image_ids @> ARRAY[i.id])""", userId);
        // 8. 운영 기록은 남기고 대상 아이디만 익명화한다(내부 추적은 target_author_id로 계속 가능).
        jdbc.update("UPDATE moderation_logs SET target_author_username=? WHERE target_author_id=?",
            ReservedUsernames.WITHDRAWN_DISPLAY_NAME + "#" + userId, userId);
        // 9. 회원 행: 식별값 익명화 + WITHDRAWN + withdrawn_at + auth_version 증가(모든 세션 무효).
        String previousStatus = user.getAccountStatus();
        user.anonymizeForWithdrawal(passwords.encode(UUID.randomUUID().toString()));
        user.markWithdrawn(now);
        users.saveAndFlush(user);
        logs.saveAndFlush(new AdminMemberAction(null, userId, "SELF_WITHDRAW:" + previousStatus));
    }

    private void recordBlocks(User user, Instant now) {
        Instant cooldown = now.plus(COOLDOWN);
        // 제재 중 탈퇴: 정지는 종료일과 30일 중 늦은 날까지, 종료일 없는 정지와 비활성화는 무기한(관리자 해제).
        boolean sanctioned = false; Instant sanctionUntil = null;
        if ("DISABLED".equals(user.getAccountStatus())) sanctioned = true;
        else if ("SUSPENDED".equals(user.getAccountStatus())) {
            Instant end = user.getSuspendedUntil();
            if (end == null) sanctioned = true;
            else if (end.isAfter(now)) { sanctioned = true; sanctionUntil = end.isAfter(cooldown) ? end : cooldown; }
        }
        String email = user.getEmail(), kakao = user.getKakaoId() == null ? null : String.valueOf(user.getKakaoId());
        for (String reason : sanctioned ? new String[]{"COOLDOWN", "SANCTION"} : new String[]{"COOLDOWN"}) {
            Instant until = "COOLDOWN".equals(reason) ? cooldown : sanctionUntil;
            blocks.record(user.getId(), WithdrawalBlocks.Type.USERNAME, user.getUsername(), reason, until);
            blocks.record(user.getId(), WithdrawalBlocks.Type.EMAIL, email, reason, until);
            blocks.record(user.getId(), WithdrawalBlocks.Type.KAKAO, kakao, reason, until);
        }
    }
}
