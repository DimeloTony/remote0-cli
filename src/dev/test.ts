/** Interactive @clack/prompts showcase. Run with: node src/test.ts */
import * as p from "@clack/prompts";
import { setTimeout as delay } from "node:timers/promises";

function unwrap<T>(value: T | symbol): T {
	if (p.isCancel(value)) {
		p.cancel("Demo cancelled.");
		process.exit(0);
	}
	return value as T;
}

p.intro("@clack/prompts kitchen sink");

// Demonstrate Clack’s non-interactive output helpers before prompting.
p.log.message("log.message(): a plain message");
p.log.info("log.info(): useful context");
p.log.step("log.step(): one step in a longer operation");
p.log.success("log.success(): something worked");
p.log.warn("log.warn() / log.warning(): something needs attention");
p.log.error("log.error(): something failed (for demonstration only)");
p.note("Prompts, selections, groups, status output, tasks, and streams", "This demo includes");
p.box("Clack can also render standalone boxed content.", "box()", {
	contentAlign: "center",
	titleAlign: "center",
	width: 58,
});

// Demonstrate scalar prompts and cancellation handling through unwrap().
const name = unwrap(
	await p.text({
		message: "What is your name?",
		placeholder: "Ada Lovelace",
		defaultValue: "Anonymous",
		validate: (value) => (!value || value.trim().length < 2 ? "Please enter at least two characters." : undefined),
	}),
);
const password = unwrap(
	await p.password({
		message: "Enter a demo password (it is not stored)",
		mask: "*",
		clearOnError: true,
		validate: (value) => (!value || value.length < 4 ? "Use at least four characters." : undefined),
	}),
);
const bio = unwrap(
	await p.multiline({
		message: "Write a short bio",
		placeholder: "Enter twice to submit, or tab to the submit button.",
		showSubmit: true,
	}),
);
const chosenDate = unwrap(
	await p.date({
		message: "Choose a date",
		initialValue: new Date(),
		minDate: new Date("1900-01-01"),
		maxDate: new Date("2100-12-31"),
	}),
);
const wantsExtras = unwrap(
	await p.confirm({
		message: "Continue through every selection prompt?",
		active: "Show them",
		inactive: "Skip them",
		initialValue: true,
	}),
);

let selections: Record<string, unknown> = {};
if (wantsExtras) {
	const runtime = unwrap(
		await p.select({
			message: "Pick one runtime",
			options: [
				{ value: "node", label: "Node.js", hint: "recommended" },
				{ value: "bun", label: "Bun" },
				{ value: "deno", label: "Deno", disabled: true },
			],
			initialValue: "node",
		}),
	);
	const framework = unwrap(
		await p.autocomplete({
			message: "Search for a framework",
			placeholder: "Type to filter...",
			options: ["SvelteKit", "Next.js", "Nuxt", "Astro", "Remix"].map((value) => ({ value })),
			maxItems: 4,
			completeOnTab: true,
		}),
	);
	const action = unwrap(
		await p.selectKey({
			message: "Press a key to choose an action",
			options: [
				{ value: "b", label: "Build" },
				{ value: "t", label: "Test" },
				{ value: "d", label: "Deploy" },
			],
		}),
	);
	const tools = unwrap(
		await p.multiselect({
			message: "Select tools (space toggles, enter submits)",
			options: ["ESLint", "Prettier", "Vitest"].map((value) => ({ value })),
			initialValues: ["ESLint"],
			required: false,
		}),
	);
	const searchableTools = unwrap(
		await p.autocompleteMultiselect({
			message: "Search for and select more tools",
			placeholder: "Type to filter...",
			options: ["Playwright", "Storybook", "Tailwind CSS", "Drizzle", "Prisma"].map((value) => ({ value })),
			required: false,
			maxItems: 4,
		}),
	);
	const features = unwrap(
		await p.groupMultiselect({
			message: "Select features by category",
			options: {
				Frontend: [
					{ value: "ui", label: "Component library" },
					{ value: "css", label: "CSS framework" },
				],
				Backend: [
					{ value: "api", label: "API" },
					{ value: "db", label: "Database" },
				],
			},
			required: false,
			selectableGroups: true,
			groupSpacing: 1,
		}),
	);
	const target = unwrap(
		await p.path({
			message: "Choose a project directory",
			root: process.cwd(),
			directory: true,
		}),
	);
	selections = { runtime, framework, action, tools, searchableTools, features, target };
}

// Demonstrate group() with a username placeholder derived from the email answer.
const account = await p.group(
	{
		email: () => p.text({ message: "Email for the group() example", placeholder: "you@example.com" }),
		username: ({ results }) =>
			p.text({
				message: "Username",
				placeholder: results.email?.split("@")[0] || "user",
			}),
	},
	{
		onCancel: () => {
			p.cancel("Grouped prompts cancelled.");
			process.exit(0);
		},
	},
);

// Demonstrate spinner(), progress(), tasks(), and taskLog() status output.
const spinner = p.spinner({ indicator: "dots" });
spinner.start("Demonstrating spinner()");
await delay(400);
spinner.message("A spinner message can change while it runs");
await delay(400);
spinner.stop("Spinner complete");

const progress = p.progress({ max: 4, size: 24, style: "block" });
progress.start("Demonstrating progress()");
for (let step = 1; step <= 4; step++) {
	await delay(150);
	progress.advance(1, `Progress ${step}/4`);
}
progress.stop("Progress complete");

await p.tasks([
	{
		title: "First task",
		task: async (message) => {
			await delay(250);
			message("The task label can update while it runs");
			await delay(250);
			return "First task complete";
		},
	},
	{ title: "Disabled task", enabled: false, task: () => "This will not run" },
]);

const taskLog = p.taskLog({ title: "taskLog() keeps a rolling log", limit: 3 });
taskLog.message("Starting");
taskLog.group("nested group").message("A grouped log message");
taskLog.message("Finishing");
taskLog.success("Task log complete", { showLog: true });

async function* streamedLines() {
	for (const line of ["stream() accepts an iterable", "It updates as values arrive", "Streaming complete"]) {
		await delay(120);
		yield line;
	}
}
await p.stream.info(streamedLines());

// Demonstrate limitOptions() and environment helpers for custom terminal UIs.
const visibleOptions = p.limitOptions({
	options: ["one", "two", "three", "four"],
	cursor: 2,
	maxItems: 3,
	style: (option, active) => `${active ? ">" : " "} ${option}`,
});
p.note([`TTY: ${p.isTTY(process.stdout)} | CI: ${p.isCI()} | Unicode: ${p.unicode}`, `unicodeOr(): ${p.unicodeOr("✓", "OK")}`, "limitOptions():", ...visibleOptions].join("\n"), "Advanced helpers");

p.note(
	JSON.stringify(
		{
			name,
			password: "*".repeat(password.length),
			bio,
			date: chosenDate.toISOString().slice(0, 10),
			...selections,
			account,
		},
		null,
		2,
	),
	"Collected answers",
);
p.outro(`Thanks, ${name}! The Clack showcase is complete.`);
