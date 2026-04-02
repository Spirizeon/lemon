import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { exec } from "child_process";
import { promisify } from "util";
import { mkdir, rm, writeFile } from "fs/promises";
import { join } from "path";

const execAsync = promisify(exec);

describe("Test Runner Tool", () => {
  const testDir = join(process.cwd(), "tests/__fixtures__/runner");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  it("should run vitest and return pass/fail results", async () => {
    const testContent = `
import { describe, it, expect } from 'vitest';

describe('math', () => {
  it('should add numbers', () => {
    expect(1 + 1).toBe(2);
  });

  it('should multiply numbers', () => {
    expect(2 * 3).toBe(6);
  });
});
`;

    await writeFile(join(testDir, "passing.test.ts"), testContent, "utf-8");

    const { stdout, stderr } = await execAsync(
      `npx vitest run ${join(testDir, "passing.test.ts")} --reporter=verbose`,
      { cwd: process.cwd() }
    );

    const output = stdout + stderr;
    const passed = !output.includes("FAIL") && !output.includes("failed");

    expect(passed).toBe(true);
    expect(output).toContain("passing.test.ts");
  });

  it("should detect failing tests", async () => {
    const testContent = `
import { describe, it, expect } from 'vitest';

describe('broken', () => {
  it('should fail intentionally', () => {
    expect(1 + 1).toBe(3);
  });
});
`;

    await writeFile(join(testDir, "failing.test.ts"), testContent, "utf-8");

    try {
      await execAsync(
        `npx vitest run ${join(testDir, "failing.test.ts")} --reporter=verbose`,
        { cwd: process.cwd() }
      );
      expect.fail("Should have thrown");
    } catch (err) {
      const output = (err as any).stdout + (err as any).stderr;
      expect(output).toMatch(/FAIL|failed/);
      expect(output).toContain("failing.test.ts");
    }
  });

  it("should parse failure details from output", async () => {
    const testContent = `
import { describe, it, expect } from 'vitest';

describe('parse failures', () => {
  it('should fail with specific message', () => {
    expect(true).toBe(false);
  });
});
`;

    await writeFile(join(testDir, "parse.test.ts"), testContent, "utf-8");

    try {
      await execAsync(
        `npx vitest run ${join(testDir, "parse.test.ts")} --reporter=verbose`,
        { cwd: process.cwd() }
      );
    } catch (err) {
      const output = (err as any).stdout + (err as any).stderr;
      expect(output).toContain("parse.test.ts");
      expect(output).toMatch(/expected|Received/);
    }
  });

  it("should throw when test file does not exist", async () => {
    await expect(
      execAsync(
        `npx vitest run ${join(testDir, "nonexistent.test.ts")} --reporter=verbose`,
        { cwd: process.cwd() }
      )
    ).rejects.toThrow();
  });
});
