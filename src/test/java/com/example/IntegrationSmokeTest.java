package com.example;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 基础连通性测试（Smoke Test）
 * 用于快速验证测试框架与CI链路是否可执行。
 */
class IntegrationSmokeTest {

    @Test
    void shouldRunInCiPipeline() {
        assertTrue(true, "Smoke test should always pass");
    }
}
