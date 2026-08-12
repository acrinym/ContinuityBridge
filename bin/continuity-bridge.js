#!/usr/bin/env node
import { runCli } from "../src/cli.js";
import { runHandoffCli } from "../src/handoff/cli.js";

const args = process.argv.slice(2);
const exitCode = args[0] === "handoff" ? await runHandoffCli(args.slice(1)) : await runCli(args);
process.exitCode = exitCode;
