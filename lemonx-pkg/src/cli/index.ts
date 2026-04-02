#!/usr/bin/env node
import "dotenv/config";

const command = process.argv[2];

switch (command) {
  case "init":
    await import("./commands/init.js");
    break;
  case "start":
    await import("./commands/start.js");
    break;
  case "tunnel":
    await import("./commands/tunnel.js");
    break;
  default:
    console.log(`
🍋 lemonx — AI-powered test generation, execution, and self-healing fixes

Usage:
  npx lemonx init      Generate CircleCI config for your repo
  npx lemonx start     Start the webhook server (listens for CircleCI triggers)
  npx lemonx tunnel    Start a local tunnel (ngrok) to expose your webhook

Run \`npx lemonx init\` in your target repo to set up CircleCI integration.
`);
    break;
}
