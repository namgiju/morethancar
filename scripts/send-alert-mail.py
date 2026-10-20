#!/usr/bin/env python3
"""운영 알림 메일 한 통을 보낸다(모터스포츠 일정 수집 실패 등).

새 알림 서비스를 쓰지 않고, 비밀번호 재설정 메일과 같은 SMTP 설정(저장소 루트 .env의 SMTP_*)을 재사용한다.
받는 주소는 .env의 MOTORSPORT_ALERT_EMAIL. 본문은 표준 입력으로 받는다.

    printf '본문' | python3 -I scripts/send-alert-mail.py "제목"

비밀번호 등 설정 값은 출력하지 않는다. 실패하면 오류 종류만 출력하고 종료 코드 1.
"""
import os
import smtplib
import sys
from email.message import EmailMessage
from pathlib import Path

MAX_BODY = 20_000


def load_env(path):
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


def main():
    if len(sys.argv) != 2:
        print("사용: send-alert-mail.py <제목> < 본문", file=sys.stderr)
        return 1
    env = {**load_env(Path(__file__).resolve().parent.parent / ".env"), **os.environ}
    to = env.get("MOTORSPORT_ALERT_EMAIL", "")
    host = env.get("SMTP_HOST", "")
    if not to or not host:
        print("알림 메일 설정 없음(MOTORSPORT_ALERT_EMAIL, SMTP_HOST)", file=sys.stderr)
        return 1
    message = EmailMessage()
    message["Subject"] = sys.argv[1]
    message["From"] = env.get("SMTP_FROM") or env.get("SMTP_USERNAME", "")
    message["To"] = to
    message.set_content(sys.stdin.read()[:MAX_BODY])
    try:
        with smtplib.SMTP(host, int(env.get("SMTP_PORT", "587")), timeout=20) as smtp:
            if env.get("SMTP_STARTTLS", "true").lower() != "false":
                smtp.starttls()
            if env.get("SMTP_AUTH", "true").lower() != "false":
                smtp.login(env.get("SMTP_USERNAME", ""), env.get("SMTP_PASSWORD", ""))
            smtp.send_message(message)
    except Exception as error:  # 메일 서버 응답에 계정 정보가 섞일 수 있어 종류만 남긴다.
        print(f"알림 메일 발송 실패: {type(error).__name__}", file=sys.stderr)
        return 1
    print("알림 메일 발송 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())
