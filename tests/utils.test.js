import assert from "node:assert/strict";
import fs from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { execFile, spawnSync } from "node:child_process";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { encodeOrDecodeBase64, getAllowedFileExtension, getDependencyInstallCommand, resolveProjectFilePath } from "../dist/utils.js";
import { fileSchema, itemSchema } from "../dist/schemas.js";

const execFileAsync = promisify(execFile);

test("resolveProjectFilePath keeps file writes inside the project", () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-project-"));
	const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-outside-"));

	try {
		assert.equal(resolveProjectFilePath("src/example.ts", projectRoot), path.join(fs.realpathSync(projectRoot), "src/example.ts"));
		assert.throws(() => resolveProjectFilePath("../outside.ts", projectRoot), /outside the current project/);
		assert.throws(() => resolveProjectFilePath("https://example.com/file.ts", projectRoot), /Invalid project-relative file path/);

		fs.symlinkSync(outsideRoot, path.join(projectRoot, "linked"));
		assert.throws(() => resolveProjectFilePath("linked/outside.ts", projectRoot), /outside the current project/);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
		fs.rmSync(outsideRoot, { recursive: true, force: true });
	}
});

test("dependency installation keeps package names as separate process arguments", () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-npm-"));

	try {
		const packageSpecifier = "example; touch should-not-exist";
		const invocation = getDependencyInstallCommand([packageSpecifier], true, projectRoot);
		assert.equal(invocation.command, "npm");
		assert.deepEqual(invocation.installArguments, ["install", "--save-dev", "--", packageSpecifier]);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test("getAllowedFileExtension supports URL queries and uppercase extensions", () => {
	assert.equal(getAllowedFileExtension("https://example.com/image.PNG?size=large"), ".png");
	assert.equal(getAllowedFileExtension("src/example.ts"), ".ts");
	assert.equal(getAllowedFileExtension("src/example.exe"), false);
});

test("encodeOrDecodeBase64 creates path-safe values and round trips text", () => {
	const value = "https://example.com/an image.png";
	const encodedValue = encodeOrDecodeBase64("encode", value);
	assert.doesNotMatch(encodedValue, /[+/=]/);
	assert.equal(encodeOrDecodeBase64("decode", encodedValue), value);
});

test("fileSchema requires valid URL and binary content paths", () => {
	assert.equal(fileSchema.safeParse({ type: "url", path: "not-a-url" }).success, false);
	assert.equal(fileSchema.safeParse({ type: "file", path: "image.png", isLocalBinary: true }).success, false);
	assert.equal(fileSchema.safeParse({ type: "file", path: "image.png", isLocalBinary: true, content: "/r/binary/image.png" }).success, true);
});

test("itemSchema accepts relative and absolute HTTP item dependencies", () => {
	assert.equal(itemSchema.safeParse({ name: "example", itemDependencies: ["/r/base.json", "https://example.com/r/theme.json"], files: [] }).success, true);
	assert.equal(itemSchema.safeParse({ name: "example", itemDependencies: ["ftp://example.com/item.json"], files: [] }).success, false);
});

test("build writes binary files with public registry URLs", () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-build-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

	try {
		fs.mkdirSync(path.join(projectRoot, "public"));
		fs.writeFileSync(path.join(projectRoot, "image.PNG"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		fs.writeFileSync(path.join(projectRoot, "remote.json"), JSON.stringify({ name: "Test registry", items: [{ name: "image", itemDependencies: ["/r/base.json"], files: [{ type: "file", path: "image.PNG", target: "assets/image.png" }] }] }));

		const result = spawnSync(process.execPath, [cliPath, "build"], { cwd: projectRoot, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr || result.stdout);

		const item = JSON.parse(fs.readFileSync(path.join(projectRoot, "public/r/image.json"), "utf8"));
		assert.deepEqual(item.itemDependencies, ["/r/base.json"]);
		assert.match(item.files[0].content, /^\/r\/binary\//);
		assert.equal(item.files[0].content.includes("public/"), false);
		assert.equal(fs.existsSync(path.join(projectRoot, "public", item.files[0].content)), true);
	} finally {
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test("add installs relative and absolute item dependencies before the requested item", async () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-add-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
	const items = {
		"/dependency.json": { name: "dependency", files: [{ type: "file", path: "dependency.txt", content: "dependency" }] },
		"/absolute-dependency.json": { name: "absolute-dependency", files: [{ type: "file", path: "absolute-dependency.txt", content: "absolute dependency" }] },
		"/item.json": {
			name: "item",
			itemDependencies: ["/dependency.json", "/dependency.json"],
			files: [{ type: "file", path: "item.txt", content: "item" }],
		},
	};
	const server = createServer((request, response) => {
		const item = items[request.url];
		if (!item) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(item));
	});

	try {
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.notEqual(address, null);
		assert.equal(typeof address, "object");
		items["/item.json"].itemDependencies.push(`http://127.0.0.1:${address.port}/absolute-dependency.json`);
		const { stdout } = await execFileAsync(process.execPath, [cliPath, "add", `http://127.0.0.1:${address.port}/item.json`, "--overwrite"], { cwd: projectRoot });

		assert.equal(fs.readFileSync(path.join(projectRoot, "dependency.txt"), "utf8"), "dependency");
		assert.equal(fs.readFileSync(path.join(projectRoot, "absolute-dependency.txt"), "utf8"), "absolute dependency");
		assert.equal(fs.readFileSync(path.join(projectRoot, "item.txt"), "utf8"), "item");
		assert.match(stdout, /Skipping already installed item/);
	} finally {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test("add rejects circular item dependencies", async () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-cycle-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
	const items = {
		"/first.json": { name: "first", itemDependencies: ["/second.json"], files: [] },
		"/second.json": { name: "second", itemDependencies: ["/first.json"], files: [] },
	};
	const server = createServer((request, response) => {
		const item = items[request.url];
		if (!item) {
			response.writeHead(404).end();
			return;
		}
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(JSON.stringify(item));
	});

	try {
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.notEqual(address, null);
		assert.equal(typeof address, "object");

		await assert.rejects(execFileAsync(process.execPath, [cliPath, "add", `http://127.0.0.1:${address.port}/first.json`, "--overwrite"], { cwd: projectRoot }), (error) => {
			assert.equal(error.code, 1);
			assert.match(error.stdout, /Circular item dependency detected/);
			return true;
		});
	} finally {
		await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});
