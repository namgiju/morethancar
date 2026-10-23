package com.revcc.app;

import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.data.redis.core.*;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PasswordResetRequestTest {
    UserRepository users=mock(UserRepository.class);
    ResetMailService mail=mock(ResetMailService.class);
    StringRedisTemplate redis=mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked") ValueOperations<String,String> values=mock(ValueOperations.class);
    MockMvc mvc;
    @BeforeEach void setup() {
        when(redis.opsForValue()).thenReturn(values);
        when(redis.execute(any(RedisScript.class),anyList(),any(Object[].class))).thenReturn(1L);
        when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(true);
        User user=new User("owner","hash"); user.registerEmail("owner@example.test");
        when(users.findByUsername("owner")).thenReturn(Optional.of(user));
        var service=new PasswordResetService(redis,users,mail,"test-secret-with-at-least-32-characters");
        mvc=MockMvcBuilders.standaloneSetup(new PasswordResetController(service)).setControllerAdvice(new MemberExceptionHandler()).build();
    }
    @Test void matchingUsernameAndNormalizedEmailSendCode() throws Exception {
        sent("owner","OWNER@example.test");
        verify(mail).send(eq("owner@example.test"),matches("[0-9]{6}"));
        verify(values).set(startsWith("password-reset:"),anyString(),eq(java.time.Duration.ofMinutes(5)));
    }
    @Test void mismatchesAndUnknownAccountsGetTheSameResponseAndNeverSend() throws Exception {
        sent("missing","owner@example.test");
        sent("owner","another@example.test");
        sent("owner","missing@example.test");
        sent("missing","missing@example.test");
        verifyNoInteractions(mail);
        // 쿨다운도 일치하는 계정에만 건다(오타 뒤 바로잡은 요청이 막히지 않는다).
        verify(values,never()).setIfAbsent(anyString(),anyString(),any(java.time.Duration.class));
        verify(values,never()).set(anyString(),anyString(),any(java.time.Duration.class));
        verify(users,never()).findByEmail(anyString());
    }
    @Test void socialOnlyAccountDoesNotSend() throws Exception {
        User user=new User("social","hash",77L);user.registerEmail("owner@example.test");
        when(users.findByUsername("social")).thenReturn(Optional.of(user));
        sent("social","owner@example.test");verifyNoInteractions(mail);
        verify(values,never()).set(anyString(),anyString(),any(java.time.Duration.class));
    }
    @Test void requestRequiresUsernameAndValidEmail() throws Exception {
        for(String body:List.of("{\"email\":\"owner@example.test\"}","{\"username\":\"  \",\"email\":\"owner@example.test\"}","{\"username\":\"owner\",\"email\":\"invalid\"}"))
            mvc.perform(post("/api/auth/password-reset/request").contentType("application/json").content(body)).andExpect(status().isBadRequest());
        verifyNoInteractions(users,mail);
    }
    @Test void requestRateLimitAppliesBeforeAccountLookupForEveryAccount() throws Exception {
        // IP·이메일 제한은 계정 조회 전에 걸리므로 일치·불일치·없는 계정 모두 같은 429다.
        when(redis.execute(any(RedisScript.class),anyList(),any(Object[].class))).thenReturn(21L);
        for (String username : List.of("owner","missing"))
            request(username,"owner@example.test",429,"RATE_LIMITED","요청이 많습니다. 잠시 후 다시 시도해주세요.");
        verifyNoInteractions(users,mail);
    }
    @Test void cooldownKeepsTheSameResponseWithoutSendingAnotherCode() throws Exception {
        when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(false);
        sent("owner","owner@example.test");
        verifyNoInteractions(mail);
        verify(values,never()).set(anyString(),anyString(),any(java.time.Duration.class));
    }
    @Test void dispatchFailureKeepsTheSameResponseAndDropsTheCode() throws Exception {
        // 발송 대기열이 가득 차도 응답으로 계정 일치를 드러내지 않는다. 발급한 코드는 지운다(로그는 서비스가 남긴다).
        doThrow(new org.springframework.core.task.TaskRejectedException("test queue full")).when(mail).send(anyString(),anyString());
        sent("owner","owner@example.test");
        verify(redis).delete(startsWith("password-reset:"));
    }
    @Test void adminRequestStillReportsCooldownAndQueueFailure() {
        // 관리자 경로는 대상 계정을 이미 확인했으므로 결과를 숨기지 않는다.
        var service=new PasswordResetService(redis,users,mail,"test-secret-with-at-least-32-characters");
        User target=users.findByUsername("owner").orElseThrow();
        service.requestForMember(target,"admin:1");
        verify(mail).send(eq("owner@example.test"),matches("[0-9]{6}"));
        when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(false);
        assertEquals(429,assertThrows(ResponseStatusException.class,()->service.requestForMember(target,"admin:1")).getStatusCode().value());
        when(values.setIfAbsent(anyString(),anyString(),any(java.time.Duration.class))).thenReturn(true);
        doThrow(new org.springframework.core.task.TaskRejectedException("test queue full")).when(mail).send(anyString(),anyString());
        assertEquals(503,assertThrows(ResponseStatusException.class,()->service.requestForMember(target,"admin:1")).getStatusCode().value());
        verify(redis).delete(startsWith("password-reset:"));
    }
    @Test void completeRejectsShortPasswordWithoutConsumingToken() throws Exception {
        String token="A".repeat(43);
        mvc.perform(post("/api/auth/password-reset/complete").contentType("application/json")
            .content("{\"token\":\""+token+"\",\"password\":\"a\",\"confirm\":\"a\"}")).andExpect(status().isBadRequest());
        verify(values,never()).getAndDelete(anyString());
        verifyNoInteractions(users);
    }
    @Test void oversizedBodyIsRejectedBeforeController() throws Exception {
        MockMvc limited=MockMvcBuilders.standaloneSetup(new PasswordResetController(mock(PasswordResetService.class)))
            .addFilter(new BodySizeLimitFilter(64*1024,5*1024*1024),"/api/*").build();
        String huge="{\"username\":\"owner\",\"email\":\""+"a".repeat(70*1024)+"@example.test\"}";
        limited.perform(post("/api/auth/password-reset/request").contentType("application/json").content(huge))
            .andExpect(status().isPayloadTooLarge());
        verifyNoInteractions(users,mail);
    }
    void sent(String username,String email) throws Exception {
        request(username,email,200,"CODE_SENT",PasswordResetController.MESSAGE);
    }
    void request(String username,String email,int expectedStatus,String code,String message) throws Exception {
        mvc.perform(post("/api/auth/password-reset/request").contentType("application/json").content("{\"username\":\""+username+"\",\"email\":\""+email+"\"}"))
            .andExpect(status().is(expectedStatus)).andExpect(jsonPath("$.code").value(code)).andExpect(jsonPath("$.message").value(message));
    }
}
