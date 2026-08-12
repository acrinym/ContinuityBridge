#!/usr/bin/env node
import { runCli } from "../src/cli.js";
import { runAttachmentsCli } from "../src/attachments/cli.js";
import { runCaptureCli } from "../src/capture/cli.js";
import { runHandoffCli } from "../src/handoff/cli.js";

const args = process.argv.slice(2);
let exitCode;
if (args[0] === "handoff") {
  exitCode = await runHandoffCli(args.slice(1));
} else if (args[0] === "attachments") {
  exitCode = await runAttachmentsCli(args.slice(1));
} else if (args[0] === "capture") {
  exitCode = await runCaptureCli(args.slice(1));
} else {
  exitCode = await runCli(args);
  if (exitCode === 0 && (!args[0] || ["help", "--help", "-h"].includes(args[0]))) {
    process.stdout.write(
      "\nExplicit live capture:\n" +
        "  continuity-bridge capture inspect <capture.json|-> [--json]\n" +
        "  continuity-bridge capture submit <capture.json|-> --to-lore [options]\n" +
        "  continuity-bridge capture serve --to-lore [options]\n" +
        "  continuity-bridge capture help\n" +
        "\nSafe attachment continuity:\n" +
        "  continuity-bridge attachments <chatgpt|claude> <export> [options]\n" +
        "  continuity-bridge attachments --help\n" +
        "\nHandoff Builder:\n" +
        "  continuity-bridge handoff --task <text> [--query <text> | --message-id <id>] [options]\n" +
        "  continuity-bridge handoff --help\n",
    );
  }
}
process.exitCode = exitCode;
