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

Text files are embedded in the generated item JSON. Binary image files (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, and `.ico`) are copied into `r/binary/` and referenced from the item JSON.

### Add a registry item

Add a generated registry item to the current project:

```bash
npx remote0 add https://remote0.dev/r/item.json
bunx remote0 add https://remote0.dev/r/item.json
```

The `add` argument must be the URL of a generated registry item JSON file, such as `https://remote0.dev/r/button.json`.

Files are written to each file's project-relative `target` path, or to `path` when no target is provided. Paths that resolve outside the current project are rejected. Declared `dependencies` and `devDependencies` are installed automatically using the package manager detected from the current project's lockfile.

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

- Node.js with support for ES modules and the Fetch API
- npm, pnpm, Yarn, or Bun
- Bun for the `devAdd` script
- Portless installed and available on your PATH for the development server

Install dependencies and build the CLI:

```bash
npm install
npm run build
```

Generate the registry files from `registry.json`, then start the development server:

```bash
node dist/index.js build
npm run devServer
```

Portless exposes the development server at `https://remote0.localhost`. The server serves the `public/` directory, including generated registry items under `/r/`.

In another terminal, add a local registry item:

```bash
npm run devAdd -- https://remote0.localhost/r/test.json
```

The `devAdd` script runs the CLI with Bun and sets `NODE_EXTRA_CA_CERTS` to `$HOME/.portless/ca.pem` so it trusts the local Portless HTTPS certificate. No separate certificate export is needed when using this script.

For dependencies hosted on the same server, use relative item URLs such as `"itemDependencies": ["/r/example.json"]`. These resolve against the requested item's URL. Regenerate the registry with `node dist/index.js build` after changing `registry.json` or its source files.

The compiled entry point is `dist/index.js`, the source entry point is `src/index.ts`, and the development server is defined in `src/dev/server.ts`.
