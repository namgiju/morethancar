package com.revcc.app;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.sql.Connection;
import java.sql.SQLException;
import java.time.Duration;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

/** 외부 감시용 /api/health가 DB 상태를 200/503으로 구분하고, 내부 정보를 싣지 않으며, 짧게 끝나는지 확인한다. */
class HealthControllerTest {
    private MockMvc mvc(DataSource dataSource, Duration timeout) {
        return MockMvcBuilders.standaloneSetup(new HealthController(dataSource, timeout)).build();
    }

    @Test void validDatabaseConnectionIsOk() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(anyInt())).thenReturn(true);
        mvc(dataSource, HealthController.TIMEOUT).perform(get("/api/health"))
            .andExpect(status().isOk())
            .andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(content().json("{\"status\":\"ok\"}", true));
        verify(connection).close();
    }

    @Test void unreachableDatabaseIs503WithoutInternalDetails() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenThrow(new SQLException("Connection to db.internal.example:5432 refused"));
        mvc(dataSource, HealthController.TIMEOUT).perform(get("/api/health"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(content().json("{\"status\":\"unavailable\"}", true));
    }

    @Test void invalidConnectionIs503() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.isValid(anyInt())).thenReturn(false);
        mvc(dataSource, HealthController.TIMEOUT).perform(get("/api/health"))
            .andExpect(status().isServiceUnavailable());
    }

    @Test void hangingDatabaseIs503WithinTheTimeout() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        when(dataSource.getConnection()).thenAnswer(invocation -> { Thread.sleep(10_000); return null; });
        long started = System.nanoTime();
        mvc(dataSource, Duration.ofMillis(300)).perform(get("/api/health"))
            .andExpect(status().isServiceUnavailable())
            .andExpect(content().json("{\"status\":\"unavailable\"}", true));
        long elapsedMs = (System.nanoTime() - started) / 1_000_000;
        assertTrue(elapsedMs >= 250 && elapsedMs < 2000, "elapsed=" + elapsedMs + "ms");
    }
}
