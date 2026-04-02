import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function startTunnel() {
  const port = process.env.WEBHOOK_PORT ?? 3456;

  console.log("🍋 lemonx tunnel — starting ngrok...\n");

  try {
    const { stdout } = await execAsync("which ngrok");
    if (!stdout.trim()) throw new Error("ngrok not found");
  } catch {
    console.error("❌ ngrok is not installed.");
    console.error("   Install it: brew install ngrok  (or download from https://ngrok.com)");
    console.error("\n   Alternatively, use Cloudflare Tunnel:");
    console.error("   cloudflared tunnel --url http://localhost:" + port);
    process.exit(1);
  }

  console.log(`📡 Exposing localhost:${port} to the internet...\n`);
  console.log("Copy the ngrok URL and use it as LEMON_WEBHOOK_URL in CircleCI settings.\n");

  const { spawn } = await import("child_process");
  const ngrok = spawn("ngrok", ["http", port.toString()]);

  ngrok.stdout.on("data", (data) => {
    process.stdout.write(data);
  });

  ngrok.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  ngrok.on("close", (code) => {
    if (code !== 0) {
      console.log(`\n⚠️  ngrok exited with code ${code}`);
    }
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => {
    ngrok.kill();
    process.exit(0);
  });
}

await startTunnel();
