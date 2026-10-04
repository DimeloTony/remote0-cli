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
import { fileSchema, itemSchema, registrySchema } from "../dist/schemas.js";

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

test("getAllowedFileExtension supports common config files and lockfiles", () => {
	assert.equal(getAllowedFileExtension(".prettierrc"), ".prettierrc");
	assert.equal(getAllowedFileExtension("config/.gitignore"), ".gitignore");
	assert.equal(getAllowedFileExtension("bun.lock"), ".lock");
	assert.equal(getAllowedFileExtension("bun.lockb"), ".lockb");
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

test("registrySchema requires either a source path or inline content with a target", () => {
	const acceptsFile = (file) => registrySchema.safeParse({ name: "Test registry", items: [{ name: "example", files: [file] }] }).success;

	assert.equal(acceptsFile({ type: "file", path: "example.txt" }), true);
	assert.equal(acceptsFile({ type: "url", path: "https://example.com/example.txt" }), true);
	assert.equal(acceptsFile({ type: "file", content: 'EXAMPLE="value_here"', target: ".env" }), true);
	assert.equal(acceptsFile({ type: "file", content: "", target: "empty" }), true);
	assert.equal(acceptsFile({ type: "file", target: ".env" }), false);
	assert.equal(acceptsFile({ type: "file", content: "example" }), false);
	assert.equal(acceptsFile({ type: "file", content: "example", target: "" }), false);
	assert.equal(acceptsFile({ type: "file", content: 123, target: ".env" }), false);
	assert.equal(acceptsFile({ type: "file", path: "example.txt", content: "", target: ".env" }), false);
	assert.equal(acceptsFile({ type: "file", content: "example", target: ".env", isLocalBinary: true }), false);
	assert.equal(acceptsFile({ type: "url", content: "example", target: ".env" }), false);
	assert.equal(acceptsFile({ type: "url", path: "not-a-url" }), false);
	assert.equal(fileSchema.safeParse({ type: "file", path: ".env", target: ".env", content: 'EXAMPLE="value_here"' }).success, true);
});

test("build and add preserve inline placeholders, empty files, and local source files", async () => {
	const registryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-inline-registry-"));
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-inline-project-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
	const files = [
		{ type: "file", content: 'EXAMPLE="value_here"\nSECOND="${PLACEHOLDER}"\n', target: ".env" },
		{ type: "file", content: "", target: "config/empty" },
		{ type: "file", path: "example.txt", target: "config/example.txt" },
	];
	const server = createServer((request, response) => {
		response.writeHead(200, { "Content-Type": "application/json" });
		response.end(fs.readFileSync(path.join(registryRoot, "public/r/example.json")));
	});

	try {
		fs.mkdirSync(path.join(registryRoot, "public"));
		fs.writeFileSync(path.join(registryRoot, "example.txt"), "local source");
		fs.writeFileSync(path.join(registryRoot, "registry.json"), JSON.stringify({ name: "Test registry", items: [{ name: "example", files }] }));

		const result = spawnSync(process.execPath, [cliPath, "build"], { cwd: registryRoot, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr || result.stdout);
		const item = JSON.parse(fs.readFileSync(path.join(registryRoot, "public/r/example.json"), "utf8"));
		assert.deepEqual(item.files[0], { type: "file", path: ".env", target: ".env", content: files[0].content });
		assert.deepEqual(item.files[1], { type: "file", path: "config/empty", target: "config/empty", content: "" });
		assert.equal(itemSchema.safeParse(item).success, true);
		assert.equal(fs.existsSync(path.join(registryRoot, ".env")), false);

		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		assert.notEqual(address, null);
		assert.equal(typeof address, "object");
		await execFileAsync(process.execPath, [cliPath, "add", `http://127.0.0.1:${address.port}/example.json`], { cwd: projectRoot });

		assert.equal(fs.readFileSync(path.join(projectRoot, ".env"), "utf8"), files[0].content);
		assert.equal(fs.readFileSync(path.join(projectRoot, "config/empty"), "utf8"), "");
		assert.equal(fs.readFileSync(path.join(projectRoot, "config/example.txt"), "utf8"), "local source");
	} finally {
		await new Promise((resolve) => server.close(resolve));
		fs.rmSync(registryRoot, { recursive: true, force: true });
		fs.rmSync(projectRoot, { recursive: true, force: true });
	}
});

test("build reads registry.json by default and writes binary files with public registry URLs", () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-build-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

	try {
		fs.mkdirSync(path.join(projectRoot, "public"));
		fs.writeFileSync(path.join(projectRoot, "image.PNG"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
		fs.writeFileSync(path.join(projectRoot, "registry.json"), JSON.stringify({ name: "Test registry", items: [{ name: "image", itemDependencies: ["/r/base.json"], files: [{ type: "file", path: "image.PNG", target: "assets/image.png" }] }] }));

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

test("build accepts an explicit remote.json path", () => {
	const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "remote0-build-custom-"));
	const cliPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));

	try {
		fs.mkdirSync(path.join(projectRoot, "public"));
		fs.writeFileSync(path.join(projectRoot, "remote.json"), JSON.stringify({ name: "Test registry", items: [{ name: "example", files: [] }] }));

		const result = spawnSync(process.execPath, [cliPath, "build", "remote.json"], { cwd: projectRoot, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr || result.stdout);
		assert.deepEqual(JSON.parse(fs.readFileSync(path.join(projectRoot, "public/r/example.json"), "utf8")), { name: "example", files: [] });
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
