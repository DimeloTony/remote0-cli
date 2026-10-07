import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

test("add respects overwrite choices for existing text and binary files", async (t) => {
	const cases = [
		{ name: "overwrite all", choice: "all", text: true, binary: true },
		{ name: "select only text", choice: "select", selected: ["folder/f1.ts"], text: true, binary: false },
		{ name: "select only binary", choice: "select", selected: ["folder/f2.png"], text: false, binary: true },
		{ name: "select no files", choice: "select", selected: [], text: false, binary: false },
		{ name: "cancel from menu", choice: "cancel", canceled: true },
		{ name: "cancel menu prompt", choice: "__cancel__", canceled: true },
		{ name: "cancel file selection", choice: "select", selected: "__cancel__", canceled: true },
		{ name: "overwrite flag skips prompts", flag: true, text: true, binary: true },
	];

	for (const scenario of cases) {
		await t.test(scenario.name, async () => {
			const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-overwrite-"));
			const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
			const binaryContent = Buffer.from([0, 255, 1, 128]);
			let binaryRequests = 0;
			const server = createServer((request, response) => {
				if (request.url === "/image.png") {
					binaryRequests++;
					response.end(binaryContent);
					return;
				}
				response.setHeader("Content-Type", "application/json");
				response.end(
					JSON.stringify({
						name: "example",
						files: [
							{ type: "file", path: "source/f1.ts", target: "folder/f1.ts", content: "new text" },
							{ type: "file", path: "source/f2.png", target: "folder/f2.png", isLocalBinary: true, content: "/image.png" },
							{ type: "file", path: "folder/new.ts", content: "new file" },
						],
					}),
				);
			});

			try {
				fs.mkdirSync(path.join(projectRoot, "folder"));
				fs.writeFileSync(path.join(projectRoot, "folder/f1.ts"), "old text");
				fs.writeFileSync(path.join(projectRoot, "folder/f2.png"), "old binary");
				await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

				// Replace only the interactive prompts so the CLI can run unattended.
				const promptsUrl = import.meta.resolve("@clack/prompts");
				const promptSource = `
					export * from ${JSON.stringify(promptsUrl)};
					import { CANCEL_SYMBOL } from ${JSON.stringify(promptsUrl)};
					export async function select() {
						console.log("OVERWRITE_MENU");
						const choice = ${JSON.stringify(scenario.choice ?? "all")};
						return choice === "__cancel__" ? CANCEL_SYMBOL : choice;
					}
					export async function multiselect() {
						console.log("OVERWRITE_SELECTION");
						const selected = ${JSON.stringify(scenario.selected ?? [])};
						return selected === "__cancel__" ? CANCEL_SYMBOL : selected;
					}
				`;
				const mockUrl = `data:text/javascript,${encodeURIComponent(promptSource)}`;
				const loaderSource = `
					export async function resolve(specifier, context, nextResolve) {
						if (specifier === "@clack/prompts") return { url: ${JSON.stringify(mockUrl)}, shortCircuit: true };
						return nextResolve(specifier, context);
					}
				`;
				const args = ["--experimental-loader", `data:text/javascript,${encodeURIComponent(loaderSource)}`, cliPath, "add", `http://127.0.0.1:${server.address().port}/item.json`];
				if (scenario.flag) args.push("--overwrite");
				let stdout;
				if (scenario.canceled) {
					await assert.rejects(execFileAsync(process.execPath, args, { cwd: projectRoot, timeout: 10_000 }), (error) => {
						assert.equal(error.code, 1);
						assert.match(error.stdout, /Okay, canceling now/);
						stdout = error.stdout;
						return true;
					});
				} else {
					({ stdout } = await execFileAsync(process.execPath, args, { cwd: projectRoot, timeout: 10_000 }));
				}

				assert.equal(fs.readFileSync(path.join(projectRoot, "folder/f1.ts"), "utf8"), scenario.text ? "new text" : "old text");
				assert.deepEqual(fs.readFileSync(path.join(projectRoot, "folder/f2.png")), scenario.binary ? binaryContent : Buffer.from("old binary"));
				assert.equal(binaryRequests, scenario.binary ? 1 : 0);
				assert.equal(fs.existsSync(path.join(projectRoot, "folder/new.ts")), !scenario.canceled);
				if (!scenario.canceled) assert.equal(fs.readFileSync(path.join(projectRoot, "folder/new.ts"), "utf8"), "new file");
				if (scenario.flag) assert.doesNotMatch(stdout, /OVERWRITE_MENU|OVERWRITE_SELECTION/);
				else assert.match(stdout, /OVERWRITE_MENU/);
				if (scenario.choice === "select") assert.match(stdout, /OVERWRITE_SELECTION/);
				else assert.doesNotMatch(stdout, /OVERWRITE_SELECTION/);
			} finally {
				await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
				fs.rmSync(projectRoot, { recursive: true, force: true });
			}
		});
	}
});
