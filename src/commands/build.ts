import fs from "node:fs";
import path from "node:path";
import * as p from "@clack/prompts";
import { BINARY_IMAGE_EXTS } from "../data.js";
import { validateOrExit, readJson, validateSchema, getAvailableStaticFolderPath, readFileContent, getAllowedFileExtension, encodeOrDecodeBase64 } from "../utils.js";
import type { ItemSchema } from "../schemas.js";

/** Builds registry item JSON files and copies their referenced assets into the output directory */
export async function buildRegistry(args: string[]) {
	p.intro("Welcome to remote0");

	// Use the provided registry path or default to remote.json.
	const registryJsonPath = args[1] || "remote.json";
	// Stop when the registry JSON file does not exist.
	validateOrExit(fs.existsSync(registryJsonPath), `Registry file '${registryJsonPath}' does not exist.`);

	const jsonReadData = await readJson(registryJsonPath);

	// Stop when the registry JSON cannot be read or parsed.
	validateOrExit(!jsonReadData.error, `Error reading '${registryJsonPath}' with error: ${jsonReadData.data}`);

	const registryValidatorRes = validateSchema("registrySchema", jsonReadData.data);

	// Stop when the registry data fails schema validation.
	validateOrExit(!registryValidatorRes.error, `Error validating registry '${registryJsonPath}' with error: ${registryValidatorRes.data}`);

	const registryData = registryValidatorRes.data;
	const outputDir = getAvailableStaticFolderPath();

	// Stop when no static or public output directory is available.
	validateOrExit(outputDir, "A static or public output directory is required to build the registry.");

	// Ensure the registry and binary output directories exist.
	const registryFolderPath = `${outputDir}/r`;
	const registryBinaryFolderPath = `${outputDir}/r/binary`;
	if (!fs.existsSync(registryFolderPath)) fs.mkdirSync(registryFolderPath, { recursive: true });
	if (!fs.existsSync(registryBinaryFolderPath)) fs.mkdirSync(registryBinaryFolderPath, { recursive: true });

	// Build one JSON file for each registry item.
	for (const item of registryData.items) {
		const spinner = p.spinner();
		spinner.start(`Building item ${item.name} at ${new Date().toLocaleString()}.`);

		const itemJsonPath = path.join(registryFolderPath, `${item.name}.json`);
		const itemOutputData: ItemSchema = { name: item.name, files: [] };
		// Include item dependency URLs when provided.
		if (item.itemDependencies) itemOutputData["itemDependencies"] = item.itemDependencies;
		// Include package dependencies when provided.
		if (item.dependencies) itemOutputData["dependencies"] = item.dependencies;
		if (item.devDependencies) itemOutputData["devDependencies"] = item.devDependencies;
		// Include the optional item description when provided.
		if (item.description) itemOutputData["description"] = item.description;

		// Process each file in the registry item.
		for (const file of item.files) {
			// Handle files referenced by URL.
			if (file.type === "url") {
				const fileUrlExt = getAllowedFileExtension(file.path);
				// Stop when the URL uses an unsupported file extension.
				validateOrExit(fileUrlExt, `URL file '${file.path}' does not use an allowed extension.`, spinner);

				// Store binary images separately instead of embedding their contents as text.
				if (BINARY_IMAGE_EXTS.includes(fileUrlExt)) {
					const fileName = encodeOrDecodeBase64("encode", file.path);
					const binaryFilePath = path.join(registryBinaryFolderPath, fileName + fileUrlExt);
					const binaryPublicPath = `/r/binary/${fileName + fileUrlExt}`;
					const urlFileContentResult = await readFileContent(file.path, true, true);
					// Stop when the binary URL content cannot be read.
					validateOrExit(!urlFileContentResult.error, `Could not read file path '${file.path}' with error: ${urlFileContentResult.data}.`, spinner);
					// Write the downloaded binary file to the registry's binary directory.
					fs.writeFileSync(binaryFilePath, urlFileContentResult.data);
					// Store the binary file path in the item data.
					itemOutputData.files.push({ type: file.type, path: file.path, target: file.target, content: binaryPublicPath, isLocalBinary: true });
				}
				// Handle non-binary files referenced by URL.
				else {
					const urlFileContentResult = await readFileContent(file.path, true);
					// Stop when the URL file content cannot be read.
					validateOrExit(!urlFileContentResult.error, `Could not read file path '${file.path}' with error: ${urlFileContentResult.data}.`, spinner);
					// Store the downloaded file content in the item data.
					itemOutputData.files.push({ type: file.type, path: file.path, target: file.target, content: urlFileContentResult.data });
				}
			}
			// Handle files stored locally.
			else {
				const pathExt = getAllowedFileExtension(file.path);
				// Stop when the local file uses an unsupported extension.
				validateOrExit(pathExt, `Local file '${file.path}' does not use an allowed extension.`, spinner);
				// Handle local binary image files.
				if (BINARY_IMAGE_EXTS.includes(pathExt)) {
					// Stop when the local binary file does not exist.
					validateOrExit(fs.existsSync(file.path), `File '${file.path}' does not exist.`, spinner);
					// Copy the binary file to the registry's binary directory.
					const fileName = encodeOrDecodeBase64("encode", file.path);
					const binaryFilePath = path.join(registryBinaryFolderPath, fileName + pathExt);
					const binaryPublicPath = `/r/binary/${fileName + pathExt}`;
					fs.copyFileSync(file.path, binaryFilePath);
					// Store the copied binary path in the item data.
					itemOutputData.files.push({ type: file.type, path: file.path, target: file.target, content: binaryPublicPath, isLocalBinary: true });
				}
				// Handle local non-binary files.
				else {
					const fileContentRes = await readFileContent(file.path);
					// Stop when the local file content cannot be read.
					validateOrExit(!fileContentRes.error, `Could not read file path '${file.path}' with error: ${fileContentRes.data}.`, spinner);
					// Store the local file content in the item data.
					itemOutputData.files.push({ type: file.type, path: file.path, target: file.target, content: fileContentRes.data });
				}
			}
		}

		// Write the generated item JSON file.
		fs.writeFileSync(itemJsonPath, JSON.stringify(itemOutputData, null, 4));
		spinner.stop(`Successfully wrote registry item ${itemJsonPath}`);
	}
}
