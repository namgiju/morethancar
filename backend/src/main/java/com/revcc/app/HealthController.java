package com.revcc.app;

import java.sql.Connection;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 외부 uptime 감시용 core health(GET /api/health). nginx /health(nginx 자체만 확인)와 달리
 * core 프로세스가 요청을 받고 DB 연결을 하나 얻어 확인할 수 있을 때만 200을 낸다.
 * 풀에서 연결 하나를 빌려 isValid(PostgreSQL에서는 빈 쿼리 한 번)만 하고 테이블은 읽지 않는다.
 * 전체 확인을 timeout으로 끊어, DB가 멈춰도 감시 요청이 Hikari 연결 대기(5초)까지 매달리지 않는다.
 * 응답에는 상태 문자열만 싣는다. 실패 원인(호스트·예외 메시지)은 서버 로그에만 남긴다.
 *
 * GET /api/health/live는 생존 확인(liveness)이다. DB·Redis를 전혀 건드리지 않고 프로세스가 요청을 받는지만 본다.
 * Compose healthcheck처럼 자주 부르는 확인은 이쪽을 써야 Neon이 5분 비활동 뒤 정지(scale to zero)할 수 있다.
 * 웹 서버는 Flyway 마이그레이션을 포함한 컨텍스트 기동이 끝난 뒤에야 요청을 받으므로, 이 경로가 200이면
 * 기동 시점의 마이그레이션은 끝난 것이다(board의 depends_on: core healthy가 기대는 조건).
 */
@RestController
public class HealthController {
    static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final Logger log = LoggerFactory.getLogger(HealthController.class);
    // DB 대기로 막힐 수 있는 작업이라 공용 ForkJoinPool 대신 가상 스레드에서 돌린다.
    private static final Executor CHECKS = Executors.newVirtualThreadPerTaskExecutor();
    private final DataSource dataSource;
    private final Duration timeout;

    @Autowired
    public HealthController(DataSource dataSource) { this(dataSource, TIMEOUT); }

    HealthController(DataSource dataSource, Duration timeout) {
        this.dataSource = dataSource;
        this.timeout = timeout;
    }

    @GetMapping("/api/health/live")
    public ResponseEntity<Map<String, String>> live() {
        return ResponseEntity.ok().header(HttpHeaders.CACHE_CONTROL, "no-store").body(Map.of("status", "ok"));
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, String>> health() {
        boolean up;
        try {
            up = CompletableFuture.supplyAsync(this::databaseValid, CHECKS)
                .get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } catch (Exception e) {
            log.warn("Health check failed: {}", e.toString());
            up = false;
        }
        return ResponseEntity.status(up ? 200 : 503).header(HttpHeaders.CACHE_CONTROL, "no-store")
            .body(Map.of("status", up ? "ok" : "unavailable"));
    }

    private boolean databaseValid() {
        try (Connection connection = dataSource.getConnection()) {
            return connection.isValid((int) Math.max(1, timeout.toSeconds()));
        } catch (Exception e) {
            log.warn("Health check database connection failed: {}", e.toString());
            return false;
        }
    }
}
