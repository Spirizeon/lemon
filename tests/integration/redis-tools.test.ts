import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { Redis } from "ioredis";
import { getRedisClient } from "../../src/redis/client";

describe("Redis Client", () => {
  let client: Redis;

  beforeAll(async () => {
    client = getRedisClient();
  });

  afterAll(async () => {
    await client.quit();
  });

  it("should connect and respond to ping", async () => {
    const result = await client.ping();
    expect(result).toBe("PONG");
  });

  it("should return the same instance on subsequent calls", () => {
    const client2 = getRedisClient();
    expect(client2).toBe(client);
  });
});

describe("Redis Tools - store-results / fetch-results", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getRedisClient();
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  beforeEach(async () => {
    const keys = await redis.keys("test_results:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  it("should store and retrieve test results", async () => {
    const entry = {
      id: "test-uuid-1",
      testId: "test-1",
      filePath: "src/__tests__/example.test.ts",
      passed: true,
      output: "All tests passed",
      failures: [],
      runAt: new Date().toISOString(),
      iteration: 1,
    };

    await redis.set(`test_results:${entry.id}`, JSON.stringify(entry));

    const raw = await redis.get(`test_results:${entry.id}`);
    const stored = JSON.parse(raw!);

    expect(stored.filePath).toBe("src/__tests__/example.test.ts");
    expect(stored.passed).toBe(true);
    expect(stored.iteration).toBe(1);
  });

  it("should store failure details", async () => {
    const entry = {
      id: "test-uuid-2",
      testId: "test-2",
      filePath: "src/__tests__/math.test.ts",
      passed: false,
      output: "FAIL: should add numbers",
      failures: [{ testName: "should add numbers", error: "Expected 3 but got 4" }],
      runAt: new Date().toISOString(),
      iteration: 2,
    };

    await redis.set(`test_results:${entry.id}`, JSON.stringify(entry));

    const raw = await redis.get(`test_results:${entry.id}`);
    const stored = JSON.parse(raw!);

    expect(stored.passed).toBe(false);
    expect(stored.failures).toHaveLength(1);
    expect(stored.failures[0].testName).toBe("should add numbers");
  });

  it("should fetch all results and compute allPassed", async () => {
    const entries = [
      { id: "r1", testId: "t1", filePath: "a.test.ts", passed: true, output: "ok", failures: [], iteration: 1 },
      { id: "r2", testId: "t2", filePath: "b.test.ts", passed: false, output: "fail", failures: [{ testName: "x", error: "err" }], iteration: 1 },
      { id: "r3", testId: "t3", filePath: "c.test.ts", passed: true, output: "ok", failures: [], iteration: 2 },
    ];

    for (const e of entries) {
      await redis.set(`test_results:${e.id}`, JSON.stringify({ ...e, runAt: new Date().toISOString() }));
    }

    const keys = await redis.keys("test_results:*");
    const results = [];
    for (const key of keys) {
      const raw = await redis.get(key);
      if (raw) results.push(JSON.parse(raw));
    }

    expect(results.length).toBe(3);
    expect(results.some((r: any) => r.passed)).toBe(true);
    expect(results.some((r: any) => !r.passed)).toBe(true);
    expect(results.every((r: any) => r.passed)).toBe(false);
  });

  it("should filter results by iteration", async () => {
    const keys = await redis.keys("test_results:*");
    if (keys.length > 0) await redis.del(...keys);

    const entries = [
      { id: "i1-r1", iteration: 1, passed: true },
      { id: "i1-r2", iteration: 1, passed: false },
      { id: "i2-r1", iteration: 2, passed: true },
    ];

    for (const e of entries) {
      await redis.set(`test_results:${e.id}`, JSON.stringify({ ...e, testId: e.id, filePath: "x.test.ts", output: "", failures: [], runAt: new Date().toISOString() }));
    }

    const allKeys = await redis.keys("test_results:*");
    const iteration1Results = [];
    for (const key of allKeys) {
      const raw = await redis.get(key);
      if (raw) {
        const entry = JSON.parse(raw);
        if (entry.iteration === 1) iteration1Results.push(entry);
      }
    }

    expect(iteration1Results.length).toBe(2);
    expect(iteration1Results.every((r: any) => r.iteration === 1)).toBe(true);
  });
});

describe("Redis Tools - store-tests / fetch-analysis", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getRedisClient();
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  beforeEach(async () => {
    const keys1 = await redis.keys("unit_tests:*");
    const keys2 = await redis.keys("code_analysis:*");
    const allKeys = [...keys1, ...keys2];
    if (allKeys.length > 0) await redis.del(...allKeys);
  });

  it("should store generated test code", async () => {
    const testCode = `import { describe, it, expect } from 'vitest';
describe('math', () => {
  it('should add', () => {
    expect(1 + 1).toBe(2);
  });
});`;

    const entry = {
      id: "test-gen-1",
      filePath: "src/math.ts",
      testFilePath: "src/__tests__/math.test.ts",
      testCode,
      generatedAt: new Date().toISOString(),
      status: "pending",
    };

    await redis.set(`unit_tests:${entry.id}`, JSON.stringify(entry));

    const raw = await redis.get(`unit_tests:${entry.id}`);
    const stored = JSON.parse(raw!);

    expect(stored.filePath).toBe("src/math.ts");
    expect(stored.testFilePath).toBe("src/__tests__/math.test.ts");
    expect(stored.testCode).toBe(testCode);
    expect(stored.status).toBe("pending");
  });

  it("should store and fetch code analysis", async () => {
    const analyses = [
      { filePath: "src/utils.ts", language: "typescript", summary: "Utility functions", issues: ["Missing null check"] },
      { filePath: "src/math.ts", language: "typescript", summary: "Math operations", issues: [] },
    ];

    for (const a of analyses) {
      await redis.set(`code_analysis:${a.filePath}`, JSON.stringify(a));
    }

    const allKeys = await redis.keys("code_analysis:*");
    const fetched = [];
    for (const key of allKeys) {
      const raw = await redis.get(key);
      if (raw) fetched.push(JSON.parse(raw));
    }

    expect(fetched.length).toBe(2);
    expect(fetched.some((a: any) => a.filePath.includes("utils"))).toBe(true);
    expect(fetched.some((a: any) => a.issues.length > 0)).toBe(true);
  });

  it("should filter analysis by filePath", async () => {
    await redis.set(
      "code_analysis:src/utils.ts",
      JSON.stringify({ filePath: "src/utils.ts", language: "typescript", summary: "Utils", issues: [] })
    );
    await redis.set(
      "code_analysis:src/math.ts",
      JSON.stringify({ filePath: "src/math.ts", language: "typescript", summary: "Math", issues: [] })
    );

    const keys = await redis.keys("code_analysis:*utils*");
    expect(keys.length).toBe(1);
    expect(keys[0]).toContain("utils");
  });

  it("should return empty when no analysis matches", async () => {
    const keys = await redis.keys("code_analysis:*nonexistent*");
    expect(keys.length).toBe(0);
  });
});

describe("Redis Tools - code patches", () => {
  let redis: Redis;

  beforeAll(async () => {
    redis = getRedisClient();
  });

  afterAll(async () => {
    await redis.flushdb();
    await redis.quit();
  });

  beforeEach(async () => {
    const keys = await redis.keys("code_patches:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  it("should store code patch metadata", async () => {
    const patch = {
      id: "patch-1",
      filePath: "src/utils.ts",
      patchDescription: "Fixed null check in parseInput",
      appliedAt: new Date().toISOString(),
      iteration: 1,
    };

    await redis.set(`code_patches:${patch.id}`, JSON.stringify(patch));

    const raw = await redis.get(`code_patches:${patch.id}`);
    const stored = JSON.parse(raw!);

    expect(stored.filePath).toBe("src/utils.ts");
    expect(stored.patchDescription).toBe("Fixed null check in parseInput");
    expect(stored.iteration).toBe(1);
  });
});
