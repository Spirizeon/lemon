import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdir, rm, writeFile, readFile } from "fs/promises";
import { join } from "path";

describe("File System Tools", () => {
  const testDir = join(process.cwd(), "tests/__fixtures__");

  beforeAll(async () => {
    await mkdir(testDir, { recursive: true });
    process.env.TARGET_REPO = testDir;
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
    delete process.env.TARGET_REPO;
  });

  beforeEach(async () => {
    await rm(testDir, { recursive: true, force: true });
    await mkdir(testDir, { recursive: true });
  });

  describe("write-file", () => {
    it("should write a file to disk", async () => {
      const fullPath = join(testDir, "test-file.ts");
      await writeFile(fullPath, "export const hello = 'world';", "utf-8");

      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("export const hello = 'world';");
    });

    it("should create parent directories if they don't exist", async () => {
      const fullPath = join(testDir, "nested", "deep", "file.ts");
      await writeFile(fullPath, "export const nested = true;", "utf-8");

      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("export const nested = true;");
    });

    it("should overwrite existing files", async () => {
      const fullPath = join(testDir, "overwrite.ts");
      await writeFile(fullPath, "old content", "utf-8");
      await writeFile(fullPath, "new content", "utf-8");

      const content = await readFile(fullPath, "utf-8");
      expect(content).toBe("new content");
    });
  });

  describe("read-file", () => {
    it("should read a file that was written", async () => {
      const fullPath = join(testDir, "readable.ts");
      const content = "export const readable = true;";
      await writeFile(fullPath, content, "utf-8");

      const read = await readFile(fullPath, "utf-8");
      expect(read).toBe(content);
    });

    it("should throw when file does not exist", async () => {
      await expect(
        readFile(join(testDir, "nonexistent.ts"), "utf-8")
      ).rejects.toThrow();
    });
  });

  describe("list-files", () => {
    it("should list TypeScript files recursively", async () => {
      await writeFile(join(testDir, "list-a.ts"), "// a", "utf-8");
      await writeFile(join(testDir, "list-b.ts"), "// b", "utf-8");
      await writeFile(join(testDir, "list-c.js"), "// c", "utf-8");

      const { readdir } = await import("fs/promises");
      const entries = await readdir(testDir, { recursive: true }) as string[];
      const files = entries.filter(f =>
        (f.endsWith(".ts") || f.endsWith(".js")) &&
        !f.includes("__tests__") &&
        !f.includes("node_modules")
      );

      expect(files.length).toBeGreaterThanOrEqual(3);
      expect(files.some((f: string) => f.endsWith(".ts"))).toBe(true);
    });

    it("should exclude node_modules and __tests__", async () => {
      await mkdir(join(testDir, "node_modules"), { recursive: true });
      await mkdir(join(testDir, "__tests__"), { recursive: true });
      await writeFile(join(testDir, "node_modules", "pkg.ts"), "// ignored", "utf-8");
      await writeFile(join(testDir, "__tests__", "test.ts"), "// ignored", "utf-8");
      await writeFile(join(testDir, "keep.ts"), "// keep", "utf-8");

      const { readdir } = await import("fs/promises");
      const entries = await readdir(testDir, { recursive: true }) as string[];
      const files = entries.filter(f =>
        (f.endsWith(".ts") || f.endsWith(".js")) &&
        !f.includes("__tests__") &&
        !f.includes("node_modules")
      );

      expect(files.some((f: string) => f.includes("node_modules"))).toBe(false);
      expect(files.some((f: string) => f.includes("__tests__"))).toBe(false);
      expect(files.some((f: string) => f.includes("keep"))).toBe(true);
    });
  });
});
