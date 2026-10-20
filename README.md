# remote0

`remote0` is a TypeScript CLI for building file registries and adding registry items to a project from a URL.

## Usage

### Build a registry

Create or update registry item files under the first existing `static/` or `public/` directory:

```bash
npx remote0 build
bunx remote0 build
```

The command reads `registry.json` from the current working directory by default.
To use a different registry definition:

```bash
npx remote0 build path/to/registry.json
```

The build command validates the registry, reads local files and URLs, and writes:

```text
public/
└── r/
    ├── <item-name>.json
    └── binary/
        └── <encoded-file-name>.<extension>
```

Text files are embedded in the generated item JSON. Binary image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico`, and `.avif`) are copied into `r/binary/` and referenced from the item JSON.

### Add a registry item

Add a generated registry item to the current project:

```bash
npx remote0 add https://remote0.dev/r/item.json
bunx remote0 add https://remote0.dev/r/item.json
```

The `add` argument must be the URL of a generated registry item JSON file, such as `https://remote0.dev/r/button.json`.

Files are written to each file's project-relative `target` path, or to `path` when no target is provided. Paths that resolve outside the current project are rejected. Declared `dependencies` and `devDependencies` are installed automatically using the package manager detected from the current project's lockfile.

If destination files already exist, the CLI offers to overwrite all, select files to overwrite, or cancel. Unselected existing files are left untouched, and new files are written normally. Each registry item, including dependencies, can prompt separately.

To overwrite all existing files without prompting:

```bash
npx remote0 add https://remote0.dev/r/item.json --overwrite
```

## Registry format

A registry definition contains a name and one or more items. Each item contains files sourced locally, from a URL, or from inline text:

```json
{
	"$schema": "https://remote0.dev/schema.json",
	"name": "My Registry",
	"description": "Reusable project files",
	"items": [
		{
			"name": "example",
			"itemDependencies": ["/r/base.json"],
			"dependencies": ["zod"],
			"files": [
				{
					"type": "file",
					"path": "src/example.ts",
					"target": "src/generated/example.ts"
				},
				{
					"type": "url",
					"path": "https://remote0.dev/example.css",
					"target": "src/generated/example.css"
				},
				{
					"type": "file",
					"content": "EXAMPLE=\"value_here\"",
					"target": ".env"
				}
			]
		}
	]
}
```

Each file entry supports:

- `type`: `file` for a local path or inline text, or `url` for a remote resource
- `path`: the local path or URL to read; omit when supplying inline `content`
- `content`: inline text for a `file` entry; use instead of `path`
- `target`: destination path used by `add`; required for inline content and optional for source paths

Inline content is embedded directly in the generated item JSON without reading a source file or checking its extension. Empty strings create empty files, and placeholders are written literally. Source entries must supply either `path` or `content`, never both. Generated item files include both `path` and `content`, with inline files using `target` as their generated `path` for compatibility with existing installers. The `isLocalBinary` field is generated metadata and cannot be supplied in a source registry.

Each registry item can also declare `itemDependencies`, an array of absolute or relative item URLs. Dependencies are installed recursively before the requested item. Repeated URLs are installed once, and circular dependency chains are rejected.

Supported files include JavaScript, TypeScript, JSON, YAML, TOML, CSS, HTML, Markdown, SVG, Vue, Svelte, and common image formats. See `src/data.ts` for the complete extension list.

The included `registry.json` demonstrates both local and URL-backed files. Use `https://remote0.dev/schema.json` in registry definitions for editor validation.

## License

ISC

## Development

Requirements:

- Node.js 18.17 or later
- npm, pnpm, Yarn, or Bun
- Bun for the development scripts and schema generation

Install dependencies and build the CLI:

```bash
npm install
npm run build
```

Generate the registry files from `registry.json`, then start the development server:

```bash
npm run dev:build
npm run dev
```

The server serves the `public/` directory at `http://localhost:8001`, including generated registry items under `/r/`. Set the `PORT` environment variable to use a different port.

In another terminal, add the local CLI registry item:

```bash
npm run dev:add
```

The `dev:add` script runs `bun src/index.ts add http://localhost:8001/r/cli.json`. To add a different item or use a different port, run the source CLI directly:

```bash
bun src/index.ts add http://localhost:8001/r/test.json
```

For dependencies hosted on the same server, use relative item URLs such as `"itemDependencies": ["/r/example.json"]`. These resolve against the requested item's URL. Regenerate the registry with `npm run dev:build` after changing `registry.json` or its source files.

Generate `public/schema.json` from the registry schema:

```bash
npm run create:schema
```

Check formatting and run the tests, which also build the CLI:

```bash
npm run format:check
npm test
```

Build and publish the package with public access:

```bash
npm run publish
```

The compiled entry point is `dist/index.js`, the source entry point is `src/index.ts`, and the development server is defined in `src/dev/server.ts`.
