package com.revcc.app;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 카카오 로그인의 DB 처리(회원 찾기·생성·닉네임 갱신). LATER-1에서 AuthController의 메서드 전체 @Transactional을 걷어내고 여기로 옮겼다 —
 * 카카오 HTTP(토큰 교환·사용자 조회) 동안에는 트랜잭션·행 잠금·DB 커넥션을 쥐지 않는다. 동작은 이전과 같다.
 */
@Service
public class KakaoAccountService {
    private final UserRepository users;
    private final WithdrawalBlocks blocks;
    private final BCryptPasswordEncoder passwords = new BCryptPasswordEncoder();

    public KakaoAccountService(UserRepository users, WithdrawalBlocks blocks) {
        this.users = users;
        this.blocks = blocks;
    }

    public enum Outcome { OK, BLOCKED, REJOIN_LIMITED }

    public record Result(Outcome outcome, User user) {}

    @Transactional
    public Result login(KakaoOAuthService.KakaoUser info) {
        // 닉네임은 바뀔 수 있으므로 카카오 ID로 같은 계정을 찾고, 처음이면 새로 만든다.
        // 이용할 수 없는 계정(정지·비활성화·탈퇴)은 아이디 갱신 등 아무것도 바꾸지 않고 먼저 거부한다.
        User user = users.lockByKakaoId(info.id()).orElse(null);
        if (user != null && user.isBlocked()) return new Result(Outcome.BLOCKED, null);
        // 탈퇴한 카카오 계정의 재가입 제한(탈퇴 시 kakao_id는 지워지므로 새 가입 경로로 들어온다).
        if (user == null && blocks.blocked(WithdrawalBlocks.Type.KAKAO, String.valueOf(info.id())))
            return new Result(Outcome.REJOIN_LIMITED, null);
        return new Result(Outcome.OK, user == null ? create(info) : refreshNickname(user, info));
    }

    private User refreshNickname(User user, KakaoOAuthService.KakaoUser info) {
        String nickname = info.nickname();
        // 카카오 동의항목이 나중에 켜져 실제 닉네임을 받게 되면 다음 로그인 때 자동으로 반영한다.
        // 다른 계정이 이미 그 이름을 쓰고 있으면 충돌을 피해 그대로 둔다.
        if (!nickname.equals(user.getUsername()) && !ReservedUsernames.isReserved(nickname) && !users.existsByUsername(nickname)
                && !blocks.blocked(WithdrawalBlocks.Type.USERNAME, nickname)) {
            user.updateUsername(nickname);
            users.saveAndFlush(user);
        }
        return user;
    }

    private User create(KakaoOAuthService.KakaoUser info) {
        String username = info.nickname();
        // 카카오 닉네임이 시스템 표시명과 겹치면 기본 이름을 쓴다(뒷자리 구분은 아래 규칙과 같다).
        if (ReservedUsernames.isReserved(username)) username = "카카오사용자";
        // 닉네임이 이미 다른 계정에서 쓰이는 중이면 카카오 ID 뒷자리를 붙여 구분한다.
        if (users.existsByUsername(username) || blocks.blocked(WithdrawalBlocks.Type.USERNAME, username)) username = username + "_" + (info.id() % 10000);
        // 카카오 로그인 전용 계정은 비밀번호로 직접 로그인하지 않으므로 무작위 해시만 채워둔다.
        return users.saveAndFlush(new User(username, passwords.encode(UUID.randomUUID().toString()), info.id()));
    }
}
