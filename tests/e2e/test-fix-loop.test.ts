import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { Redis } from "ioredis";
import { getRedisClient } from "../../src/redis/client";

describe("E2E: Test-Fix Loop", () => {
  const testDir = join(process.cwd(), "tests/__fixtures__/e2e-loop");
  let redis: Redis;

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    process.env.TARGET_REPO = testDir;
    redis = getRedisClient();
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    await redis.quit();
    delete process.env.TARGET_REPO;
  });

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
    const keys = await redis.keys("test_results:*");
    if (keys.length > 0) await redis.del(...keys);
  });

  it("should write a source file, generate a test, run it, and store results", async () => {
    const sourceContent = `
export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}
`;

    await writeFile(join(testDir, "src", "math.ts"), sourceContent, "utf-8");

    const testContent = `
import { describe, it, expect } from 'vitest';
import { add, multiply } from '../src/math';

describe('math', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });

  it('should multiply two numbers', () => {
    expect(multiply(2, 3)).toBe(6);
  });
});
`;

    await writeFile(join(testDir, "src", "__tests__", "math.test.ts"), testContent, "utf-8");

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    const { stdout, stderr } = await execAsync(
      `npx vitest run ${join(testDir, "src", "__tests__", "math.test.ts")} --reporter=verbose`,
      { cwd: testDir }
    );

    const output = stdout + stderr;
    const passed = !output.includes("FAIL") && !output.includes("failed");

    expect(passed).toBe(true);

    await redis.set(
      "test_results:e2e-1",
      JSON.stringify({
        id: "e2e-1",
        testId: "math",
        filePath: "src/__tests__/math.test.ts",
        passed,
        output,
        failures: [],
        iteration: 1,
        runAt: new Date().toISOString(),
      })
    );

    const stored = await redis.get("test_results:e2e-1");
    const parsed = JSON.parse(stored!);
    expect(parsed.passed).toBe(true);
  });

  it("should detect a failing test, store failure, and simulate a fix", async () => {
    const sourceContent = `
export function divide(a: number, b: number): number {
  return a / b;
}
`;

    await writeFile(join(testDir, "src", "calc.ts"), sourceContent, "utf-8");

    const testContent = `
import { describe, it, expect } from 'vitest';
import { divide } from '../src/calc';

describe('calc', () => {
  it('should divide two numbers', () => {
    expect(divide(10, 2)).toBe(5);
  });

  it('should handle division by zero', () => {
    expect(() => divide(1, 0)).toThrow();
  });
});
`;

    await writeFile(join(testDir, "src", "__tests__", "calc.test.ts"), testContent, "utf-8");

    const { exec } = await import("child_process");
    const { promisify } = await import("util");
    const execAsync = promisify(exec);

    try {
      await execAsync(
        `npx vitest run ${join(testDir, "src", "__tests__", "calc.test.ts")} --reporter=verbose`,
        { cwd: testDir }
      );
    } catch (err: any) {
      const output = err.stdout + err.stderr;
      expect(output).toMatch(/FAIL|failed/);

      await redis.set(
        "test_results:e2e-2",
        JSON.stringify({
          id: "e2e-2",
          testId: "calc",
          filePath: "src/__tests__/calc.test.ts",
          passed: false,
          output,
          failures: [{ testName: "should handle division by zero", error: "Expected function to throw" }],
          iteration: 1,
          runAt: new Date().toISOString(),
        })
      );
    }

    const stored = await redis.get("test_results:e2e-2");
    const parsed = JSON.parse(stored!);
    expect(parsed.passed).toBe(false);
    expect(parsed.failures.length).toBeGreaterThan(0);

    const fixedSource = `
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
}
`;

    await writeFile(join(testDir, "src", "calc.ts"), fixedSource, "utf-8");

    await redis.set(
      "code_patches:fix-1",
      JSON.stringify({
        id: "fix-1",
        filePath: "src/calc.ts",
        patchDescription: "Added division by zero check",
        appliedAt: new Date().toISOString(),
        iteration: 1,
      })
    );

    const { stdout: fixedStdout, stderr: fixedStderr } = await execAsync(
      `npx vitest run ${join(testDir, "src", "__tests__", "calc.test.ts")} --reporter=verbose`,
      { cwd: testDir }
    );

    const fixedOutput = fixedStdout + fixedStderr;
    const fixedPassed = !fixedOutput.includes("FAIL") && !fixedOutput.includes("failed");
    expect(fixedPassed).toBe(true);
  });

  it("should track multiple iterations until all pass", async () => {
    const iterations: { iteration: number; passed: boolean; fixes: string[] }[] = [];

    for (let iteration = 1; iteration <= 3; iteration++) {
      const sourceContent = `
export function subtract(a: number, b: number): number {
  ${iteration >= 2 ? 'if (typeof a !== "number" || typeof b !== "number") throw new Error("Invalid input");' : ""}
  return a - b;
}
`;

      await writeFile(join(testDir, "src", "ops.ts"), sourceContent, "utf-8");

      const testContent = `
import { describe, it, expect } from 'vitest';
import { subtract } from '../src/ops';

describe('ops', () => {
  it('should subtract two numbers', () => {
    expect(subtract(5, 3)).toBe(2);
  });

  it('should throw on invalid input', () => {
    expect(() => subtract("a" as any, 1)).toThrow();
  });
});
`;

      await writeFile(join(testDir, "src", "__tests__", "ops.test.ts"), testContent, "utf-8");

      const { exec } = await import("child_process");
      const { promisify } = await import("util");
      const execAsync = promisify(exec);

      let passed = false;
      let output = "";
      try {
        const { stdout, stderr } = await execAsync(
          `npx vitest run ${join(testDir, "src", "__tests__", "ops.test.ts")} --reporter=verbose`,
          { cwd: testDir }
        );
        output = stdout + stderr;
        passed = !output.includes("FAIL") && !output.includes("failed");
      } catch (err: any) {
        output = err.stdout + err.stderr;
      }

      const fixes = iteration >= 2 ? ["Added type validation"] : [];
      iterations.push({ iteration, passed, fixes });

      await redis.set(
        `test_results:iter-${iteration}`,
        JSON.stringify({
          id: `iter-${iteration}`,
          testId: "ops",
          filePath: "src/__tests__/ops.test.ts",
          passed,
          output,
          failures: passed ? [] : [{ testName: "should throw on invalid input", error: "Expected function to throw" }],
          iteration,
          runAt: new Date().toISOString(),
        })
      );

      if (passed) break;
    }

    const passedIterations = iterations.filter(i => i.passed);
    expect(passedIterations.length).toBeGreaterThan(0);
    expect(iterations[iterations.length - 1].passed).toBe(true);
  });
});
