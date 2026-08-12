#!/usr/bin/env node
import { runCli } from "../src/cli.js";
import { runHandoffCli } from "../src/handoff/cli.js";

const args = process.argv.slice(2);
let exitCode;
if (args[0] === "handoff") {
  exitCode = await runHandoffCli(args.slice(1));
} else {
  exitCode = await runCli(args);
  if (exitCode === 0 && (!args[0] || ["help", "--help", "-h"].includes(args[0]))) {
    process.stdout.write(
      "\nHandoff Builder:\n  continuity-bridge handoff --task <text> [--query <text> | --message-id <id>] [options]\n  continuity-bridge handoff --help\n",
    );
  }
}
process.exitCode = exitCode;
