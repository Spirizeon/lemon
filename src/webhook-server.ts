import express, { Request, Response } from "express";
import { mastra } from "./mastra/index.js";
import { readdir, readFile, mkdir, rm } from "fs/promises";
import { join } from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { tmpdir } from "os";
import { randomUUID } from "crypto";

const execAsync = promisify(exec);

const app = express();
app.use(express.json());

const PORT = process.env.WEBHOOK_PORT ?? 3456;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const MAX_ITERATIONS = 5;
const WORK_DIR = join(tmpdir(), "lemonx-workspaces");
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";

async function getFileSha(owner: string, repo: string, path: string, branch: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha;
  } catch {
    return null;
  }
}

async function uploadFileToGitHub(
  owner: string,
  repo: string,
  filePath: string,
  content: string,
  branch: string
): Promise<void> {
  const sha = await getFileSha(owner, repo, filePath, branch);

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `🍋 lemonx: generated ${filePath}`,
        content: Buffer.from(content).toString("base64"),
        branch,
        sha: sha ?? undefined,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to upload ${filePath}: ${err}`);
  }
}

async function getBaseBranchSha(owner: string, repo: string, branch: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches/${branch}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.commit.sha;
  } catch {
    return null;
  }
}

async function createBranch(owner: string, repo: string, branch: string, baseSha: string): Promise<void> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseSha,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to create branch ${branch}: ${err}`);
  }
}

// ── Webhook signature verification ──────────────────────────────
async function verifySignature(req: Request): Promise<boolean> {
  if (!WEBHOOK_SECRET) return true;
  const sig = req.headers["x-webhook-signature"] as string;
  if (!sig) return false;
  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(JSON.stringify(req.body))
    .digest("hex");
  return sig === `sha256=${expected}`;
}

// ── Git clone helper ────────────────────────────────────────────
async function cloneRepo(repoUrl: string, branch: string, commitSha: string): Promise<string> {
  const workspaceId = randomUUID().slice(0, 8);
  const workspace = join(WORK_DIR, workspaceId);
  await mkdir(workspace, { recursive: true });

  console.log(`  📦 Cloning ${repoUrl} (${branch})...`);

  if (!repoUrl.startsWith("http") && !repoUrl.includes("://")) {
    repoUrl = `https://github.com/${repoUrl}.git`;
  }

  let cloneUrl = repoUrl;
  if (GITHUB_TOKEN && repoUrl.startsWith("https://github.com/")) {
    cloneUrl = repoUrl.replace("https://github.com/", `https://x-access-token:${GITHUB_TOKEN}@github.com/`);
  }

  await execAsync(`git clone --branch ${branch} --depth 1 ${cloneUrl} ${workspace}`, {
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });

  if (commitSha) {
    console.log(`  🔖 Checking out commit ${commitSha.slice(0, 7)}...`);
    await execAsync(`git fetch --depth 1 origin ${commitSha} && git checkout ${commitSha}`, {
      cwd: workspace,
    });
  }

  console.log(`  📦 Installing dependencies...`);
  try {
    await execAsync("npm install", { cwd: workspace, timeout: 120000 });
  } catch {
    console.log("  ⚠️  npm install failed — proceeding anyway");
  }

  return workspace;
}

// ── GitHub PR helper ────────────────────────────────────────────
async function openPR(repoUrl: string, branch: string, prBranch: string, prTitle: string, prBody: string): Promise<string | null> {
  if (!GITHUB_TOKEN) {
    console.log("  ⚠️  GITHUB_TOKEN not set — skipping PR creation");
    return null;
  }

  const match = repoUrl.replace(/\.git$/, "").match(/github\.com[:/]([^/]+)\/([^/]+)/);
  if (!match) {
    console.log("  ⚠️  Could not parse repo URL for PR");
    return null;
  }
  const [, owner, repo] = match;

  console.log(`  📝 Opening PR: ${prTitle}`);

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GITHUB_TOKEN}`,
      "Accept": "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      title: prTitle,
      body: prBody,
      head: prBranch,
      base: branch,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.log(`  ❌ Failed to open PR: ${err}`);
    return null;
  }

  const data = await res.json();
  console.log(`  ✅ PR created: ${data.html_url}`);
  return data.html_url;
}

// ── Health check ────────────────────────────────────────────────
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", agents: ["testGeneratorAgent", "executorAgent", "editorAgent", "integrationGeneratorAgent", "e2eGeneratorAgent"] });
});

// ── Trigger full test-fix loop (SYNCHRONOUS) ────────────────────
app.post("/webhook/test-and-fix", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  console.log(`\n🔔 Webhook received: ${repoUrl}/${branch} (${commitSha?.slice(0, 7) ?? "unknown"})`);

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;
    console.log(`  📂 Working directory: ${workspace}`);

    const unitResult = await runTestFixLoop(workspace, "unit");
    const integrationResult = await runTestFixLoop(workspace, "integration");
    const e2eResult = await runTestFixLoop(workspace, "e2e");
    console.log("\n✅ Test-fix loops completed:", { unit: unitResult, integration: integrationResult, e2e: e2eResult });

    const allPassed = unitResult.status === "passed" && integrationResult.status === "passed" && e2eResult.status === "passed";

    // Build summary for CircleCI
    const summary: {
      status: string;
      repo: string;
      branch: string;
      commit: string | undefined;
      unit: { status: string; iterations: number; files: number };
      integration: { status: string; iterations: number; files: number };
      e2e: { status: string; iterations: number; files: number };
      changedFiles: string[];
      pr?: string;
    } = {
      status: allPassed ? "passed" : "failed",
      repo: repoUrl,
      branch,
      commit: commitSha,
      unit: { status: unitResult.status, iterations: unitResult.iterations, files: unitResult.files },
      integration: { status: integrationResult.status, iterations: integrationResult.iterations, files: integrationResult.files },
      e2e: { status: e2eResult.status, iterations: e2eResult.iterations, files: e2eResult.files },
      changedFiles: [
        ...(unitResult.changedFiles || []),
        ...(integrationResult.changedFiles || []),
        ...(e2eResult.changedFiles || []),
      ],
    };

    // Open PR if all passed and there are changes
    if (allPassed && summary.changedFiles.length > 0 && workspace) {
      const prBranch = `lemonx/test-fix-${Date.now()}`;
      const prTitle = `🍋 lemonx: auto-generated tests + fixes for ${branch}`;
      const prBody = `## 🍋 lemonx — AI Test Report

**Branch:** ${branch}
**Commit:** ${commitSha?.slice(0, 7) ?? "unknown"}

### Test Results
| Test Type | Status | Iterations |
|---|---|---|
| Unit | ${unitResult.status} | ${unitResult.iterations} |
| Integration | ${integrationResult.status} | ${integrationResult.iterations} |
| E2E | ${e2eResult.status} | ${e2eResult.iterations} |

### What changed
- Generated vitest unit, integration, and E2E tests for source files
- Ran tests and collected pass/fail results
- Applied code fixes to make tests pass
- All tests passing ✅

### Changed files
${summary.changedFiles.map((f: string) => `- \`${f}\``).join("\n")}
`;

      try {
        const match = repoUrl.replace(/\.git$/, "").match(/github\.com[:/]([^/]+)\/([^/]+)/);
        if (!match) {
          console.log("  ⚠️  Could not parse repo URL for upload");
        } else {
          const [, owner, repo] = match;
          const testDirs = ["src/__tests__", "tests/integration", "tests/e2e"];
          const files: { path: string; content: string }[] = [];

          for (const dir of testDirs) {
            try {
              const entries = await readdir(join(workspace, dir), { recursive: true }) as string[];
              for (const entry of entries) {
                if (entry.endsWith(".test.ts") || entry.endsWith(".test.js")) {
                  const fullPath = join(workspace, dir, entry);
                  const content = await readFile(fullPath, "utf-8");
                  files.push({ path: `${dir}/${entry}`, content });
                }
              }
            } catch {
              // Directory doesn't exist, skip
            }
          }

          if (files.length > 0) {
            const baseSha = await getBaseBranchSha(owner, repo, branch);
            if (!baseSha) {
              console.log("  ❌ Could not get base branch SHA");
            } else {
              await createBranch(owner, repo, prBranch, baseSha);
              console.log(`  🌿 Created branch: ${prBranch}`);

              console.log(`  📤 Uploading ${files.length} files to GitHub...`);
              for (const file of files) {
                await uploadFileToGitHub(owner, repo, file.path, file.content, prBranch);
                console.log(`    ✓ ${file.path}`);
              }

              const prUrl = await openPR(repoUrl, branch, prBranch, prTitle, prBody);
              if (prUrl) {
                summary.pr = prUrl;
                console.log(`\n🎉 PR opened: ${prUrl}`);
              }
            }
          }
        }
      } catch (err) {
        console.log(`  ⚠️  PR creation skipped: ${err}`);
      }
    }

    // Return results synchronously to CircleCI
    res.json(summary);
  } catch (err: any) {
    console.error("\n❌ Test-fix loop failed:", err);
    res.status(500).json({
      status: "error",
      error: err.message,
      repo: repoUrl,
      branch,
      commit: commitSha,
    });
  } finally {
    if (workspace) {
      console.log(`  🧹 Cleaning up workspace: ${workspace}`);
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
});

// ── Trigger unit test generation ────────────────────────────────
app.post("/webhook/generate-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, files } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  console.log(`\n🔔 Webhook received: generate unit tests for ${repoUrl}/${branch}`);

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;

    const sourceFiles = files ?? await discoverFiles(workspace);
    const generated = [];

    for (const file of sourceFiles) {
      console.log(`  Generating tests for: ${file}`);
      const generator = mastra.getAgent("testGeneratorAgent");
      const testPath = file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts");
      await generator.generate(`
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest unit test file for this source file.
        3. Call write-file with:
           - path="src/__tests__/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="src/__tests__/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `);
      generated.push({ file, testPath, success: true });
      console.log(`  ✓ ${file} → src/__tests__/${testPath}`);
    }

    res.json({ status: "done", generated });
  } catch (err: any) {
    console.error("  ✗ Generation failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
});

// ── Trigger integration test generation ─────────────────────────
app.post("/webhook/generate-integration-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, files } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  console.log(`\n🔔 Webhook received: generate integration tests for ${repoUrl}/${branch}`);

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;

    const sourceFiles = files ?? await discoverIntegrationFiles(workspace);
    const generated = [];

    for (const file of sourceFiles) {
      console.log(`  Generating integration tests for: ${file}`);
      const generator = mastra.getAgent("integrationGeneratorAgent");
      const testPath = file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts");
      await generator.generate(`
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest integration test file for this source file.
        3. Call write-file with:
           - path="tests/integration/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="tests/integration/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `);
      generated.push({ file, testPath, success: true });
      console.log(`  ✓ ${file} → tests/integration/${testPath}`);
    }

    res.json({ status: "done", generated });
  } catch (err: any) {
    console.error("  ✗ Generation failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
});

// ── Trigger E2E test generation ─────────────────────────────────
app.post("/webhook/generate-e2e-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, files } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  console.log(`\n🔔 Webhook received: generate E2E tests for ${repoUrl}/${branch}`);

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;

    const sourceFiles = files ?? await discoverE2EFiles(workspace);
    const generated = [];

    for (const file of sourceFiles) {
      console.log(`  Generating E2E tests for: ${file}`);
      const generator = mastra.getAgent("e2eGeneratorAgent");
      const testPath = file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts");
      await generator.generate(`
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest E2E test file for this source file.
        3. Call write-file with:
           - path="tests/e2e/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="tests/e2e/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `);
      generated.push({ file, testPath, success: true });
      console.log(`  ✓ ${file} → tests/e2e/${testPath}`);
    }

    res.json({ status: "done", generated });
  } catch (err: any) {
    console.error("  ✗ Generation failed:", err);
    res.status(500).json({ error: err.message });
  } finally {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
});

// ── Trigger test execution ──────────────────────────────────────
app.post("/webhook/run-tests", async (req: Request, res: Response) => {
  if (!(await verifySignature(req))) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { repoUrl, branch, commitSha, testFile } = req.body;

  if (!repoUrl || !branch) {
    return res.status(400).json({ error: "repoUrl and branch are required" });
  }

  let workspace: string | null = null;
  try {
    workspace = await cloneRepo(repoUrl, branch, commitSha);
    process.env.LEMON_WORKSPACE = workspace;

    const testFiles = testFile
      ? [testFile]
      : await discoverTestFiles(workspace, "src/__tests__");

    if (testFiles.length === 0) {
      return res.json({ status: "done", results: [], message: "No test files found" });
    }

    const results = [];
    for (const tf of testFiles) {
      const executor = mastra.getAgent("executorAgent");
      const execRes = await executor.generate(`
        Do the following steps in order:
        1. Call run-tests with testFilePath="${tf}"
        2. Call store-results with:
           - testId = any unique string
           - filePath = "${tf}"
           - passed = true or false based on run-tests result
           - output = the full output from run-tests
           - failures = array of {testName, error} objects from the run-tests result
           - iteration = 1
        Do both steps now.
      `);
      const passed = !execRes.text.toLowerCase().includes("fail") && !execRes.text.toLowerCase().includes("error");
      results.push({ file: tf, passed, summary: execRes.text.slice(0, 200) });
    }

    res.json({ status: "done", results });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (workspace) {
      await rm(workspace, { recursive: true, force: true }).catch(() => {});
      delete process.env.LEMON_WORKSPACE;
    }
  }
});

// ── Helper: discover source files ───────────────────────────────
async function discoverFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      !f.includes("seeds/") &&
      !f.includes("migrations/") &&
      !f.includes("public/")
    )
    .slice(0, 5);
}

// ── Helper: discover test files ─────────────────────────────────
async function discoverTestFiles(repoPath: string, testDir: string) {
  try {
    const entries = await readdir(join(repoPath, testDir), { recursive: true }) as string[];
    return entries
      .filter(f => f.endsWith(".test.ts") || f.endsWith(".test.js"))
      .map(f => `${testDir}/${f}`);
  } catch {
    return [];
  }
}

// ── Full test-fix loop ──────────────────────────────────────────
async function runTestFixLoop(targetDir: string, testType: "unit" | "integration" | "e2e" = "unit") {
  const executor = mastra.getAgent("executorAgent");
  const editor = mastra.getAgent("editorAgent");

  const config = {
    unit: {
      generatorName: "testGeneratorAgent" as const,
      testDir: "src/__tests__",
      label: "unit",
      discoverFn: () => discoverFiles(targetDir),
      testPathFn: (file: string) => file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts"),
      promptFn: (file: string, testPath: string) => `
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest unit test file for this source file.
        3. Call write-file with:
           - path="src/__tests__/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="src/__tests__/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `,
    },
    integration: {
      generatorName: "integrationGeneratorAgent" as const,
      testDir: "tests/integration",
      label: "integration",
      discoverFn: () => discoverIntegrationFiles(targetDir),
      testPathFn: (file: string) => file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts"),
      promptFn: (file: string, testPath: string) => `
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest integration test file for this source file.
        3. Call write-file with:
           - path="tests/integration/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="tests/integration/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `,
    },
    e2e: {
      generatorName: "e2eGeneratorAgent" as const,
      testDir: "tests/e2e",
      label: "E2E",
      discoverFn: () => discoverE2EFiles(targetDir),
      testPathFn: (file: string) => file.replace(/^src\//, "").replace(/\.ts$/, ".test.ts"),
      promptFn: (file: string, testPath: string) => `
        Do the following steps in order:
        1. Call read-file with path="${file}" to read the source code.
        2. Write a comprehensive vitest E2E test file for this source file.
        3. Call write-file with:
           - path="tests/e2e/${testPath}"
           - content = the full test file you wrote
        4. Call store-tests with:
           - filePath="${file}"
           - testFilePath="tests/e2e/${testPath}"
           - testCode = the full test file content
        Do all 4 steps now.
      `,
    },
  };

const cfg = config[testType];
  const generator = mastra.getAgent(cfg.generatorName);

  const files = await cfg.discoverFn();
  console.log(`🔍 Found ${files.length} source files for ${cfg.label} tests`);

  // Step 1: Generate tests
  console.log(`📝 Generating ${cfg.label} tests...`);
  for (const file of files) {
    const testPath = cfg.testPathFn(file);
    await generator.generate(cfg.promptFn(file, testPath));
    console.log(`  ✓ ${file}`);
  }

  // Step 2: Run + fix loop
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    console.log(`🧪 Iteration ${iteration}: Running ${cfg.label} tests...`);

    const testFiles = await discoverTestFiles(targetDir, cfg.testDir);
    if (testFiles.length === 0) break;

    let allPassed = true;
    for (const testFile of testFiles) {
      const execRes = await executor.generate(`
        Do the following steps in order:
        1. Call run-tests with testFilePath="${testFile}"
        2. Call store-results with:
           - testId = any unique string
           - filePath = "${testFile}"
           - passed = true or false based on run-tests result
           - output = the full output from run-tests
           - failures = array of {testName, error} objects from the run-tests result
           - iteration = ${iteration}
        Do both steps now.
      `);
      console.log(`  ${testFile}: ${execRes.text.slice(0, 80)}`);

      if (execRes.text.toLowerCase().includes("fail") || execRes.text.toLowerCase().includes("error")) {
        allPassed = false;
      }
    }

    if (allPassed) {
      console.log(`✅ All ${cfg.label} tests passed on iteration ${iteration}`);
      const changedFiles = await getChangedFiles(targetDir);
      return { status: "passed", iterations: iteration, files: testFiles.length, changedFiles, type: cfg.label };
    }

    if (iteration === MAX_ITERATIONS) {
      console.log(`⚠️ Max iterations reached for ${cfg.label} tests`);
      const changedFiles = await getChangedFiles(targetDir);
      return { status: "max_iterations", iterations: iteration, files: testFiles.length, changedFiles, type: cfg.label };
    }

    console.log(`🔧 Iteration ${iteration}: Fixing ${cfg.label} failures...`);
    const editRes = await editor.generate(`
      Do the following steps in order:
      1. Call fetch-results with iteration=${iteration} to get failing tests.
      2. For each failing test, call read-file on the source file being tested.
      3. For each failing test, fix the source file and call write-file to save it with:
         - patchDescription = a short description of what you fixed
         - iteration = ${iteration}
      Do all steps now.
    `);
    console.log(`  Editor: ${editRes.text.slice(0, 150)}`);
  }

  const changedFiles = await getChangedFiles(targetDir);
  return { status: "completed", iterations: MAX_ITERATIONS, files: 0, changedFiles, type: cfg.label };
}

async function getChangedFiles(repoPath: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync("git diff --name-only HEAD", { cwd: repoPath });
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ── Helper: discover integration test target files ──────────────
async function discoverIntegrationFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      (f.includes("routes") || f.includes("api") || f.includes("service") || f.includes("controller") || f.includes("middleware") || f.includes("handler"))
    )
    .slice(0, 5);
}

// ── Helper: discover E2E test target files ──────────────────────
async function discoverE2EFiles(repoPath: string) {
  const entries = await readdir(repoPath, { recursive: true }) as string[];
  return entries
    .filter(f =>
      (f.endsWith(".ts") || f.endsWith(".js")) &&
      !f.includes("node_modules") &&
      !f.includes("__tests__") &&
      !f.includes(".d.ts") &&
      (f.includes("app") || f.includes("server") || f.includes("index") || f.includes("routes") || f.includes("auth"))
    )
    .slice(0, 3);
}

// ── Start server ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🍋 lemon.test webhook server running on port ${PORT}`);
  console.log(`   POST /webhook/test-and-fix               — full generate + run + fix loop (sync)`);
  console.log(`   POST /webhook/generate-tests             — generate unit tests`);
  console.log(`   POST /webhook/generate-integration-tests — generate integration tests`);
  console.log(`   POST /webhook/generate-e2e-tests         — generate E2E tests`);
  console.log(`   POST /webhook/run-tests                  — run tests`);
  console.log(`   GET  /health                             — health check`);
});
