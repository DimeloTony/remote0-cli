#!/usr/bin/env node

import { log } from "./utils.js";
import { buildRegistry } from "./commands/build.js";
import { addRegistryItem } from "./commands/add.js";
import { COMMANDS } from "./data.js";

const ARGS = process.argv.slice(2);
const COMMAND = ARGS[0] as "build" | "add";

// Reject unsupported commands before dispatching to a command handler.
if (!COMMANDS.includes(COMMAND)) {
	log.error("Run a valid command: 'build', 'build remote.json', or 'add <registry-item-url>'.");
	process.exit(1);
}

// Run the registry build command.
if (COMMAND === "build") await buildRegistry(ARGS);

// Run the registry item add command.
else if (COMMAND === "add") await addRegistryItem(ARGS);
