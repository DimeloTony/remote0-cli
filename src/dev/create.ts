import z from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registrySchema } from "../schemas.js";
import { log } from "../utils.js";

/** Directory containing this schema-generation script */
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
/** Output path for the generated registry JSON Schema */
const schemaPath = resolve(scriptDirectory, "../../public/schema.json");
/** JSON Schema generated from `registrySchema` using the Draft 7 format */
const schema = z.toJSONSchema(registrySchema, { target: "draft-7" });

// Ensure the output directory exists before writing the schema.
await mkdir(dirname(schemaPath), { recursive: true });
// Write the generated schema as formatted JSON.
await writeFile(schemaPath, `${JSON.stringify(schema, null, "\t")}\n`, "utf8");

log.successful(`Generated JSON Schema file ${schemaPath}`);
