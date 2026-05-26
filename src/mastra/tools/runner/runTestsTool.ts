import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const LOG_PREFIX = "[RUN_TESTS_TOOL]";
const VERBOSE = process.env.VERBOSE !== "false" && process.env.VERBOSE !== "0";
const DEBUG = process.env.DEBUG === "true" || process.env.DEBUG === "1";

const failurePattern = /✗\s+(.+)\n[\s\S]*?Error:\s+(.+)/g;

function parseFailures(output: string) {
  const failures: { testName: string; error: string }[] = [];
  let match;
  while ((match = failurePattern.exec(output)) !== null) {
    failures.push({ testName: match[1].trim(), error: match[2].trim() });
  }
  return failures;
}

export const runTestsTool = createTool({
  id: "run-tests",
  description: "Execute vitest on a specific test file and return pass/fail results",
  inputSchema: z.object({
    testFilePath: z.string().describe("e.g. src/__tests__/myModule.test.ts"),
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    output: z.string(),
    failures: z.array(z.object({ testName: z.string(), error: z.string() })),
    metadata: z.object({
      testFile: z.string(),
      exitCode: z.number(),
      duration: z.number(),
    }),
  }),
  execute: async ({ testFilePath }) => {
    const workspace = process.env.LEMON_WORKSPACE ?? process.env.TARGET_REPO ?? process.cwd();
    const startTime = Date.now();
    
    console.log(`${LOG_PREFIX} 📝 Executing test file: ${testFilePath}`);
    console.log(`${LOG_PREFIX} 📁 Workspace: ${workspace}`);
    try {
      console.log(`${LOG_PREFIX} ⚙️ Running: npx vitest run ${testFilePath} --reporter=verbose`);
      
      const { stdout, stderr } = await execAsync(
        `npx vitest run ${testFilePath} --reporter=verbose`,
        { cwd: workspace }
      );
      
      const duration = Date.now() - startTime;
      const output = stdout + stderr;
      const passed = !output.includes("FAIL") && !output.includes("failed");
      const failures = parseFailures(output);
      
      console.log(`${LOG_PREFIX} 📊 Test Results:`);
      console.log(`${LOG_PREFIX}    Passed: ${passed}`);
      console.log(`${LOG_PREFIX}    Duration: ${duration}ms`);
      console.log(`${LOG_PREFIX}    Failures: ${failures.length}`);
      if (failures.length > 0) {
        failures.forEach((f, i) => {
          console.log(`${LOG_PREFIX}      [${i + 1}] ${f.testName}: ${f.error}`);
        });
      }
      console.log(`${LOG_PREFIX} 📄 Full Output:\n${output}\n${"=".repeat(80)}`);
      
      return { passed, output, failures, metadata: { testFile: testFilePath, exitCode: 0, duration } };
    } catch (err: any) {
      const duration = Date.now() - startTime;
      const exitCode = err.code ?? 1;
      const output = err.stdout + err.stderr;
      const failures = parseFailures(output);
      
      console.log(`${LOG_PREFIX} ❌ Test execution failed:`);
      console.log(`${LOG_PREFIX}    Exit Code: ${exitCode}`);
      console.log(`${LOG_PREFIX}    Duration: ${duration}ms`);
      console.log(`${LOG_PREFIX}    Failures: ${failures.length}`);
      failures.forEach((f, i) => {
        console.log(`${LOG_PREFIX}      [${i + 1}] ${f.testName}: ${f.error}`);
      });
      console.log(`${LOG_PREFIX} 📄 Full Output:\n${output}\n${"=".repeat(80)}`);
      
      return {
        passed: false,
        output,
        failures,
        metadata: { testFile: testFilePath, exitCode, duration },
      };
    }
  },
});
