import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { validateOrExit, installDependencies, readFileContent, readJson, validateSchema, getExistingFilePaths, resolveProjectFilePath } from "../utils.js";
import type { ItemSchema } from "../schemas.js";

type AddRegistryState = {
	overwrite: boolean;
	activeItemUrls: Set<string>;
	installedItemUrls: Set<string>;
};

/** Adds a registry item and its files to the current project */
export async function addRegistryItem(args: string[]) {
	p.intro("Welcome to remote0");

	/** Registry item URL supplied as the first CLI argument */
	const inputPath = args.slice(1).find((argument) => argument !== "--overwrite");
	const itemUrl = resolveItemUrl(inputPath);
	const state: AddRegistryState = { overwrite: args.includes("--overwrite"), activeItemUrls: new Set(), installedItemUrls: new Set() };
	await addRegistryItemFromUrl(itemUrl, state);
}

/** Resolves and installs an item and its item dependencies */
async function addRegistryItemFromUrl(itemUrl: URL, state: AddRegistryState) {
	const itemUrlKey = itemUrl.href;
	if (state.installedItemUrls.has(itemUrlKey)) {
		p.log.info(`Skipping already installed item ${itemUrlKey}`);
		return;
	}
	validateOrExit(!state.activeItemUrls.has(itemUrlKey), `Circular item dependency detected at '${itemUrlKey}'.`);
	state.activeItemUrls.add(itemUrlKey);

	const inputJsonResult = await readJson(itemUrl.href, true);
	// Exit when the registry item cannot be read.
	validateOrExit(!inputJsonResult.error, `Unable to read JSON from '${itemUrl}' with error: ${inputJsonResult.data}`);

	const registryValidationResult = validateSchema("itemSchema", inputJsonResult.data);
	// Exit when the input does not match the item schema.
	validateOrExit(!registryValidationResult.error, `Error validating input '${itemUrl}' with error: ${registryValidationResult.data}`);

	// Log the registry item URL being added.
	p.log.info(`Adding ${itemUrl.href}`);

	const inputData = registryValidationResult.data;
	for (const itemDependency of inputData.itemDependencies ?? []) {
		await addRegistryItemFromUrl(resolveItemUrl(itemDependency, itemUrl), state);
	}

	await writeRegistryItemFiles(inputData, itemUrl, state.overwrite);
	installRegistryItemDependencies(inputData);
	state.activeItemUrls.delete(itemUrlKey);
	state.installedItemUrls.add(itemUrlKey);
}

/** Writes every file from a validated registry item */
async function writeRegistryItemFiles(inputData: ItemSchema, itemUrl: URL, overwrite: boolean) {
	let existingFilePaths: string[] = [];
	try {
		existingFilePaths = getExistingFilePaths(inputData.files);
	} catch (error: unknown) {
		validateOrExit(false, error instanceof Error ? error.message : "Unable to validate registry file paths.");
	}

	// If `--overwrite` was not provided and destination files already exist, ask before overwriting them.
	if (!overwrite && existingFilePaths.length > 0) {
		existingFilePaths.forEach((file) => p.log.warn(`File ${file} already exists and will be overwritten.`));
		const shouldOverwrite = await p.confirm({ message: "Overwrite files?" });
		// Cancel when the user declines to overwrite existing files.
		if (!shouldOverwrite) validateOrExit(shouldOverwrite, "Okay, canceling now.");
	}

	// Process each file in the registry item.
	for (const file of inputData.files) {
		// Use the requested target path or the source path by default.
		let fileTarget: string;
		try {
			fileTarget = resolveProjectFilePath(file.target || file.path);
		} catch (error: unknown) {
			validateOrExit(false, error instanceof Error ? error.message : "Unable to resolve the registry file path.");
		}

		// Handle a non-binary file.
		if (!file.isLocalBinary) {
			validateOrExit(file.content !== undefined, `Registry item file '${file.path}' does not include content.`);
			try {
				// Create parent directories before writing the file.
				fs.mkdirSync(path.dirname(fileTarget), { recursive: true });
				fs.writeFileSync(fileTarget, file.content);
				p.log.success(`Wrote file ${fileTarget}`);
			} catch (error: any) {
				validateOrExit(false, `Error adding file '${fileTarget}' with error: ${error.message}`);
			}
		}
		// Handle a binary file.
		else {
			validateOrExit(file.content !== undefined, `Registry item binary file '${file.path}' does not include a content path.`);
			const url = new URL(file.content, itemUrl);
			validateOrExit(url.origin === itemUrl.origin, `Binary file URL '${url}' must use the registry item's origin.`);

			// Fetch the binary file content.
			const urlFileContentResult = await readFileContent(url.href, true, true);
			// Exit when the binary file cannot be read.
			validateOrExit(!urlFileContentResult.error, `Could not read data from '${url}' with error: ${urlFileContentResult.data}.`);

			// Write the binary file to disk.
			try {
				// Create parent directories before writing the file.
				fs.mkdirSync(path.dirname(fileTarget), { recursive: true });
				fs.writeFileSync(fileTarget, urlFileContentResult.data);
				p.log.success(`Wrote file ${fileTarget}`);
			} catch (error: any) {
				validateOrExit(false, `Error adding file '${fileTarget}' with error: ${error.message}`);
			}
		}
	}
}

/** Installs the runtime and development dependencies declared by an item */
function installRegistryItemDependencies(inputData: ItemSchema) {
	let spinner: ReturnType<typeof p.spinner> | undefined;
	// Install runtime dependencies.
	if (inputData.dependencies) {
		spinner = p.spinner({ indicator: "dots" });
		spinner.start("Installing dependencies");
		installDependencies(inputData.dependencies);
	}
	// Install development dependencies.
	if (inputData.devDependencies) {
		// Update the active spinner when runtime dependencies were installed first.
		if (spinner) spinner.message("Installing dev dependencies");
		// Otherwise, create and start a spinner.
		else {
			spinner = p.spinner({ indicator: "dots" });
			spinner.start("Installing dev dependencies");
		}
		installDependencies(inputData.devDependencies, true);
	}

	if (spinner) spinner.stop("Installed dependencies");
}

/** Resolves an absolute or parent-relative item URL and enforces HTTP transport */
function resolveItemUrl(itemPath: string | undefined, parentUrl?: URL) {
	validateOrExit(itemPath && URL.canParse(itemPath, parentUrl?.href), "Please provide a valid registry item URL.");
	const itemUrl = new URL(itemPath, parentUrl);
	validateOrExit(["http:", "https:"].includes(itemUrl.protocol), "Registry item URLs must use HTTP or HTTPS.");
	itemUrl.hash = "";
	return itemUrl;
}
