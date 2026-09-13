import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as p from "@clack/prompts";
import { ALLOW_FILE_EXTS } from "./data.js";
import * as schemas from "./schemas.js";
import type { infer as Infer } from "zod";
import type { Schemas, FileSchema } from "./schemas.js";

/** Provides color-coded methods for normal, error, and successful log messages */
export const log = {
	normal: (data: string) => console.log(`\x1B[34m${data}\x1b[0m`),
	error: (data: string) => console.log(`\x1b[31m${data}\x1b[0m`),
	successful: (data: string) => console.log(`\x1b[32m${data}\x1b[0m`),
};

/** Exits with an error when the condition is falsy */
export function validateOrExit(condition: unknown, message: string, spinner?: p.SpinnerResult): asserts condition {
	if (!condition) {
		// Stop an active spinner with the validation message.
		if (spinner) spinner.stop(message);
		p.cancel(message);
		process.exit(1);
	}
}

/** Reads and parses JSON from a local file or URL, returning either the data or an error message */
export async function readJson(jsonPath: string, fromUrl?: boolean): Promise<{ error: true; data: string } | { error: false; data: any }> {
	try {
		// Fetch the JSON from a URL when requested.
		if (fromUrl) {
			const request = await fetch(jsonPath, { signal: AbortSignal.timeout(10_000) });
			// Return an error for unsuccessful HTTP responses.
			if (request.status !== 200) return { error: true, data: `Received HTTP ${request.status} from URL '${jsonPath}'.` };
			// Return the parsed JSON response.
			const response = await request.json();
			return { error: false, data: response };
		}
		// Read the local JSON file when building the registry.
		const jsonData = fs.readFileSync(jsonPath);
		return { error: false, data: JSON.parse(jsonData.toString()) };
	} catch (error: any) {
		return { error: true, data: error.message };
	}
}

/** Validates input against the selected schema and returns the result or an error message */
export function validateSchema<S extends Schemas>(schema: S, input: unknown): ValidationResult<S> {
	const response = schemas[schema].safeParse(input);
	// Return a formatted error when validation fails.
	if (!response.success) {
		const message = `Error validating schema '${schema}'.\nError: ${response.error.message}`;
		return { error: true as const, data: message };
	}
	// Return the validated data when validation succeeds.
	return { error: false as const, data: response.data as SchemaOutput<S> };
}

/** Returns the first existing `static` or `public` folder name, or `undefined` if neither exists */
export function getAvailableStaticFolderPath() {
	for (const folder of ["static", "public"]) {
		// Return the first existing static folder name.
		if (fs.existsSync(folder)) return folder;
	}
}

/** Reads text or binary content from a local file or URL, returning the content or an error message */
export async function readFileContent(filePath: string, fromUrl?: boolean, asBinary?: boolean): Promise<{ error: boolean; data: any }> {
	try {
		// Fetch the file from a URL when requested.
		if (fromUrl) {
			const request = await fetch(filePath, { signal: AbortSignal.timeout(10_000) });
			// Return an error for unsuccessful HTTP responses.
			if (request.status !== 200) return { error: true, data: `Received HTTP ${request.status} from URL '${filePath}'.` };
			// Return the binary response data.
			if (asBinary) {
				const buffer = Buffer.from(await request.arrayBuffer());
				return { error: false, data: buffer };
			}
			// Return the text response body.
			const response = await request.text();
			return { error: false, data: response };
		}
		const fileContent = fs.readFileSync(filePath);
		// Return local binary content as Base64.
		if (asBinary) return { error: false, data: fileContent.toString("base64") };
		return { error: false, data: fileContent.toString() };
	} catch (error: any) {
		return { error: true, data: error.message };
	}
}

/** Returns an allowed file extension, or false when the path has no supported extension */
export function getAllowedFileExtension(filePath: string) {
	let pathWithoutQuery = filePath;
	try {
		pathWithoutQuery = new URL(filePath).pathname;
	} catch {
		// Keep local paths unchanged.
	}

	const fileExt = path.extname(pathWithoutQuery).toLowerCase();
	if (!fileExt || !ALLOW_FILE_EXTS.includes(fileExt)) return false;
	return fileExt;
}

/** Encodes text as Base64 or decodes Base64 into UTF-8 text */
export function encodeOrDecodeBase64(action: "encode" | "decode", data: string) {
	// Encode the text as Base64.
	if (action === "encode") return Buffer.from(data, "utf8").toString("base64url");
	// Decode Base64 into UTF-8 text.
	return Buffer.from(data, "base64url").toString("utf8");
}

/** Installs packages without passing registry-controlled values through a shell */
export function installDependencies(packages: string[], asDevDependencies = false) {
	if (packages.length === 0) return;
	const workingDirectory = process.cwd();
	const { command, installArguments } = getDependencyInstallCommand(packages, asDevDependencies, workingDirectory);
	execFileSync(command, installArguments, { stdio: "ignore", cwd: workingDirectory });
}

/** Returns a shell-free package-manager command for installing dependencies */
export function getDependencyInstallCommand(packages: string[], asDevDependencies = false, workingDirectory = process.cwd()) {
	let command: string;
	let installArguments: string[];

	if (fs.existsSync(path.join(workingDirectory, "bun.lock")) || fs.existsSync(path.join(workingDirectory, "bun.lockb"))) {
		command = "bun";
		installArguments = ["add", ...(asDevDependencies ? ["--dev"] : []), "--", ...packages];
	} else if (fs.existsSync(path.join(workingDirectory, "pnpm-lock.yaml"))) {
		command = "pnpm";
		installArguments = ["add", ...(asDevDependencies ? ["--save-dev"] : []), "--", ...packages];
	} else if (fs.existsSync(path.join(workingDirectory, "yarn.lock"))) {
		command = "yarn";
		installArguments = ["add", ...(asDevDependencies ? ["--dev"] : []), "--", ...packages];
	} else {
		command = "npm";
		installArguments = ["install", ...(asDevDependencies ? ["--save-dev"] : []), "--", ...packages];
	}

	return { command, installArguments };
}

/** Resolves a project-relative file path and rejects paths that escape the project root */
export function resolveProjectFilePath(filePath: string, projectRoot = process.cwd()) {
	if (!filePath || path.isAbsolute(filePath) || URL.canParse(filePath)) throw new Error(`Invalid project-relative file path '${filePath}'.`);

	const resolvedProjectRoot = fs.realpathSync(projectRoot);
	const resolvedFilePath = path.resolve(resolvedProjectRoot, filePath);
	if (!isPathInside(resolvedProjectRoot, resolvedFilePath)) throw new Error(`File path '${filePath}' resolves outside the current project.`);

	let existingAncestor = resolvedFilePath;
	while (!fs.existsSync(existingAncestor)) existingAncestor = path.dirname(existingAncestor);
	if (!isPathInside(resolvedProjectRoot, fs.realpathSync(existingAncestor), true)) throw new Error(`File path '${filePath}' resolves outside the current project.`);

	return resolvedFilePath;
}

/** Returns unique destination paths that already exist in the project */
export function getExistingFilePaths(itemFiles: FileSchema[]) {
	const files: string[] = [];
	// Collect unique destination paths that already exist.
	for (const file of itemFiles) {
		const destinationPath = file.target || file.path;
		const resolvedFilePath = resolveProjectFilePath(destinationPath);
		const fileExists = fs.existsSync(resolvedFilePath);
		if (fileExists && !files.includes(destinationPath)) files.push(destinationPath);
	}
	return files;
}

/** Returns whether a path is inside a root directory */
function isPathInside(rootPath: string, candidatePath: string, allowRoot = false) {
	const relativePath = path.relative(rootPath, candidatePath);
	if (!relativePath) return allowRoot;
	return relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

/** Maps a schema name to its inferred output type */
type SchemaOutput<S extends Schemas> = Infer<(typeof schemas)[S]>;

/** Represents the success or failure result returned by schema validation */
type ValidationResult<S extends Schemas> = { error: true; data: string } | { error: false; data: SchemaOutput<S> };
