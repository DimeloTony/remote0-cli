# remote0 CLI

This document describes how the `remote0` CLI is structured, how each command flows through the codebase, and how registry data moves from source files to an installable registry item.

## What the CLI does

`remote0` has two commands:

```text
remote0 build [registry.json]
remote0 add <registry-item-url>
```

`build` packages one or more registry items into JSON files and static binary assets. `add` consumes one generated item JSON file and is intended to copy its files into the current project and install its dependencies.

The published executable is `dist/index.js`. The TypeScript entry point is `src/index.ts`, and the package exposes it through the `bin` field in `package.json`. This allows all of the following forms when the package is installed or invoked through a package runner:

```bash
npx remote0 build
bunx remote0 build
node dist/index.js build
```

## Top-level dispatch flow

The process starts in `src/index.ts`:

1. Node removes the executable name from `process.argv` with `process.argv.slice(2)`.
2. The first remaining argument is treated as the command.
3. The command is checked against `build` and `add`.
4. Unsupported or missing commands are logged as errors and the process exits.
5. The original argument array is passed to the selected command handler.

The handlers are:

| Command | Handler                 | Source                  |
| ------- | ----------------------- | ----------------------- |
| `build` | `buildRegistry(args)`   | `src/commands/build.ts` |
| `add`   | `addRegistryItem(args)` | `src/commands/add.ts`   |

The command handlers use the shared functions in `src/utils/index.ts` for JSON loading, schema validation, content loading, dependency installation, and logging.

## `build` flow

### Invocation

```bash
npx remote0 build
npx remote0 build path/to/registry.json
```

If no path is supplied, the command reads `remote.json` from the current working directory. Paths are resolved relative to the directory from which the CLI is run, not relative to the installed package.

### Detailed flow

`src/commands/build.ts` performs the following steps:

1. Select the registry definition path from `args[1]`, falling back to `remote.json`.
2. Check that the registry file exists.
3. Read and parse the local JSON file with `readJson()`.
4. Validate the parsed object against `registrySchema` using Zod.
5. Find the output directory. `getAvailableStaticFolderPath()` checks `static` first, then `public`.
6. Create `<output>/r` and `<output>/r/binary` when they do not exist.
7. Process every item in the registry definition.
8. Write one generated item JSON file to `<output>/r/<item.name>.json`.

The build is sequential: files are processed in registry order, and each remote file is fetched before the next file is handled.

### Build output

For a project with a `public` directory, the output looks like this:

```text
public/
└── r/
    ├── <item-name>.json
    └── binary/
		└── <base64url-encoded-source-path>.<extension>
```

Each generated item starts with its `name` and `files`. Optional `description`, `itemDependencies`, `dependencies`, and `devDependencies` are copied from the source item.

### File handling during build

Each file entry has a `type` of `file` or `url`.

For a local file (`type: "file"`):

- Binary image files with extensions `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, or `.ico` are copied to `r/binary`.
- Other files are read as UTF-8 text and embedded directly in the generated item JSON as `content`.

For a URL file (`type: "url"`):

- The URL extension is checked against `ALLOW_FILE_EXTS`.
- Binary image URLs are downloaded into `r/binary` and represented by a generated file entry with `isLocalBinary: true`.
- Other supported URL files are downloaded as text and embedded in the generated item JSON.

Binary filenames are made deterministic by Base64url-encoding the original source path. The generated file entry keeps the original `path`, the optional `target`, a public `/r/binary/...` content path, and `isLocalBinary: true`.

Example source definition:

```json
{
	"name": "example",
	"files": [
		{
			"type": "file",
			"path": "src/example.ts",
			"target": "src/generated/example.ts"
		},
		{
			"type": "url",
			"path": "https://example.com/theme.css",
			"target": "src/generated/theme.css"
		}
	]
}
```

After building, the text files are represented approximately as:

```json
{
	"name": "example",
	"files": [
		{
			"type": "file",
			"path": "src/example.ts",
			"target": "src/generated/example.ts",
			"content": "...file contents..."
		},
		{
			"type": "url",
			"path": "https://example.com/theme.css",
			"target": "src/generated/theme.css",
			"content": "...downloaded contents..."
		}
	]
}
```

### Build failure points

The build stops when:

- the registry file does not exist;
- the registry JSON cannot be parsed;
- the registry does not match `registrySchema`;
- neither `static` nor `public` exists;
- a URL has no extension accepted by `ALLOW_FILE_EXTS`;
- a local binary file does not exist; or
- a local or remote file cannot be read.

The command writes items as it goes. If a later item fails, files already written by earlier items are not rolled back.

## `add` flow

### Invocation

```bash
npx remote0 add https://remote0.dev/r/button.json
```

The argument must be a string beginning with `http`. The command then:

1. Fetches the URL as JSON with `readJson(url, true)`.
2. Requires an HTTP 200 response.
3. Validates the response against `itemSchema`.
4. Resolves and installs each `itemDependencies` URL before continuing with the requested item.
5. Validates that every destination is project-relative and remains inside the project, including through existing symlinks.
6. Checks whether each `target` path already exists, falling back to the source `path` when there is no target.
7. If existing paths are found and `--overwrite` was not supplied, displays them and opens an `@clack/prompts` confirmation prompt.
8. Writes text content and fetches same-origin binary assets into their destination paths.
9. Installs `dependencies` and `devDependencies` using the detected package manager.

Item dependency URLs may be absolute or relative to the item that declares them. The command installs each normalized URL once and rejects circular dependency chains. The `--overwrite` option applies throughout the recursive installation.

### File installation behavior

The file installation code uses these rules:

- `file.target` is the destination when provided; otherwise `file.path` is used.
- Parent directories are created recursively before writing.
- Text files use the generated `content` field.
- Binary files are fetched from the generated `content` path, which must resolve to the same origin as the item JSON URL.
- Absolute destinations, URLs used as destinations, traversal outside the project, and paths through outward-pointing symlinks are rejected.
- A write failure is logged per file.

Dependency installation is delegated to `installDependencies()`:

| Detected lockfile         | Command                                          |
| ------------------------- | ------------------------------------------------ |
| `bun.lock` or `bun.lockb` | `bun add ...` / `bun add --dev ...`              |
| `pnpm-lock.yaml`          | `pnpm add ...` / `pnpm add --save-dev ...`       |
| `yarn.lock`               | `yarn add ...` / `yarn add --dev ...`            |
| none of the above         | `npm install ...` / `npm install --save-dev ...` |

Package names are passed directly as process arguments without a command shell. Development dependencies use the detected package manager’s development flag.

## Registry data model

The schemas are defined in `src/schemas.ts` and are also used at runtime for validation.

### Registry definition

```ts
type Registry = {
	$schema?: string;
	name: string;
	description?: string;
	items: Item[];
};
```

### Registry item

```ts
type Item = {
	name: string;
	description?: string;
	itemDependencies?: string[];
	dependencies?: string[];
	devDependencies?: string[];
	files: File[];
};
```

### File entry

```ts
type File = {
	type: "file" | "url";
	path: string;
	target?: string;
	content?: string;
	isLocalBinary?: boolean;
};
```

`content` and `isLocalBinary` are normally generated metadata. A source registry definition generally supplies only `type`, `path`, and optionally `target`.

## Supported extensions

`src/data.ts` defines the accepted extension groups:

- Web: `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`
- JavaScript: `.js`, `.jsx`, `.mjs`, `.cjs`
- TypeScript: `.ts`, `.tsx`, `.mts`, `.cts`
- Data: `.json`, `.jsonc`, `.yaml`, `.yml`, `.toml`, `.xml`
- Text: `.txt`, `.md`, `.mdx`
- Images: `.svg`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico`
- Frameworks: `.vue`, `.svelte`

PNG, JPEG, WebP, GIF, and ICO files are treated as binary by the build command. SVG files follow the text-content path.

Both local and URL entries are rejected when their extension is not allowed. URL extension checks ignore query strings and normalize uppercase extensions.

## Shared utilities

`src/utils/index.ts` contains the cross-command behavior:

- `log` prints blue normal messages, red errors, and green success messages.
- `readJson()` reads local JSON or fetches JSON from a URL. URL JSON requests have a 10-second timeout.
- `validateSchema()` wraps Zod’s `safeParse()` and returns a discriminated `{ error, data }` result.
- `getAvailableStaticFolderPath()` chooses `static` before `public`.
- `readFileContent()` reads local files or fetches remote content as text or binary data with a 10-second timeout.
- `getAllowedFileExtension()` returns a lowercase path or URL extension when it is in `ALLOW_FILE_EXTS`, otherwise `false`.
- `encodeOrDecodeBase64()` Base64url-encodes source paths for binary asset names or decodes those values.
- `resolveProjectFilePath()` rejects destinations that escape the current project.
- `getExistingFilePaths()` checks validated target-or-source paths for overwrite warnings.
- `installDependencies()` chooses a package manager from the current working directory’s lockfile.

## Development workflow

Install dependencies and compile TypeScript with:

```bash
npm install
npm run build
```

The build cleans `dist`, compiles the production TypeScript sources, and writes JavaScript and declaration files to `dist`. The package’s executable points at `dist/index.js`, so rebuild after changing TypeScript source before testing the packaged entry point.

The repository also contains a development app copy under `dev/app/cli`. The `remote.json` item named `cli` is configured to package selected source files into that directory. Treat `src/` as the CLI source of truth; update the generated/dev copy through the project’s registry workflow when that copy needs to be refreshed.

## Adding or changing a command

For a new command:

1. Add the command name to the dispatcher in `src/index.ts` and to the command list in `src/data.ts` if the shared list is used.
2. Create a handler under `src/commands/`.
3. Keep input parsing and orchestration in the handler; put reusable filesystem, network, or package-manager behavior in `src/utils/index.ts`.
4. Add or update Zod schemas when the command accepts new registry data.
5. Update `README.md`, this document, and the generated/dev copy if the command is part of the packaged registry item.
6. Run `npm run build` to verify TypeScript compilation.

When changing build output formats, check both sides of the flow: `build` creates the item JSON and binary paths, while `add` consumes those fields.
