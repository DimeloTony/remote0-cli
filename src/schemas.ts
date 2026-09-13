import z from "zod";

const itemDependencySchema = z
	.string()
	.min(1)
	.refine((value) => {
		try {
			return ["http:", "https:"].includes(new URL(value, "https://registry.invalid").protocol);
		} catch {
			return false;
		}
	}, "Item dependencies must be absolute or relative HTTP URLs.");

/** Describes a file, URL, or image input with an optional output target */
export const fileSchema = z
	.object({
		type: z.enum(["file", "url"]),
		path: z.string().min(1),
		target: z.string().min(1).optional(),
		isLocalBinary: z.boolean().optional().describe("Indicates that `content` references a binary asset emitted into the registry's binary directory."),
		content: z.string().optional().describe("Contains generated file content or a generated binary asset path."),
	})
	.superRefine((file, context) => {
		if (file.type === "url" && !URL.canParse(file.path)) context.addIssue({ code: "custom", path: ["path"], message: "URL files require a valid URL path." });
		if (file.isLocalBinary && !file.content) context.addIssue({ code: "custom", path: ["content"], message: "Binary registry files require a content path." });
	});

/** Describes a named registry item with an optional description and associated files */
export const itemSchema = z.object({
	name: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/i, "Item names may contain only letters, numbers, periods, underscores, and hyphens."),
	description: z.string().optional(),
	itemDependencies: z.array(itemDependencySchema).optional().describe("Item URLs to install before this registry item."),
	dependencies: z.array(z.string()).optional(),
	devDependencies: z.array(z.string()).optional(),
	files: z.array(fileSchema),
});

/** Describes a named registry with an optional description and a list of items */
export const registrySchema = z.object({
	$schema: z.string().optional(),
	name: z.string(),
	description: z.string().optional(),
	items: z.array(itemSchema),
});

/** Names of the available validation schemas */
export type Schemas = "fileSchema" | "itemSchema" | "registrySchema";

/** Type of a file reference validated by `fileSchema` */
export type FileSchema = z.infer<typeof fileSchema>;

/** Type of a registry item validated by `itemSchema` */
export type ItemSchema = z.infer<typeof itemSchema>;

/** Type of a registry validated by `registrySchema` */
export type RegistrySchema = z.infer<typeof registrySchema>;
