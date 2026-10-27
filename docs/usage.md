---
title: "Using remote0"
description: "Write a registry.json file, build a file registry, and add registry items to a project from a URL"
---

# Using remote0

remote0 is a command-line tool with two jobs: `build` turns a `registry.json` file into item JSON files you can host, and `add` downloads one of those items into your project, writes its files, and installs its packages. This page is for anyone publishing or using a remote0 registry, and it covers how to write `registry.json`, which file entry type to use for each kind of file, how to run each command, what happens when files already exist, how remote0 picks a package manager, and what it does when your project has no lock file.

## Run remote0

You can run remote0 without installing it, through the package runner that comes with your package manager. If the runner resolves an older release, pin the version you want.

- Run `npx remote0 <command>` with npm
- Run `pnx remote0 <command>` with pnpm
- Run `bunx remote0 <command>` with Bun
- Pin a version such as `pnx remote0@0.0.8` when the runner resolves an older release

## Write registry.json

The `registry.json` file describes your registry and lists the items people can add. Put it in the folder where you run `build`, because local file paths resolve from that folder.

- Set `name` to the registry name
- Add `description` to describe the registry
- Add `$schema` with the path to a remote0 JSON schema file to get editor validation
- List every item in `items`

```json title="registry.json"
{
	"$schema": "./public/schema.json",
	"name": "my-registry",
	"description": "Shared files for my projects",
	"items": [
		{
			"name": "button",
			"description": "Button component",
			"dependencies": ["clsx"],
			"files": [
				{
					"type": "file",
					"path": "src/components/button.svelte",
					"target": "src/lib/components/button.svelte"
				}
			]
		}
	]
}
```

## Define an Item

Each item becomes one JSON file named after the item, such as `button.json`. An item holds its files, the packages it needs, and the other items it builds on.

- Set `name` using only letters, numbers, periods, underscores, and hyphens
- Add `description` to describe the item
- List the item's files in `files`
- Add packages to `dependencies`, such as `zod` or `@clack/prompts@^1.8.0`
- Add development packages to `devDependencies`
- Add item URLs to `itemDependencies` to install other items first

## Add a Local File

Use `"type": "file"` with a `path` when the file lives in your repository. The build reads the file and stores its content in the item JSON, so the source file does not need to be hosted.

- Set `type` to `file`
- Set `path` to the file location relative to the folder where you run `build`
- Set `target` to the destination path in the project that adds the item
- Leave out `target` to write the file to the same path as `path`
- Keep `target` inside the project, because `add` rejects paths that leave it

```json
{
	"type": "file",
	"path": "src/utils.ts",
	"target": "src/lib/utils/index.ts"
}
```

## Add a File from a URL

Use `"type": "url"` when the file lives on another server. The build downloads the file once and stores a copy in the item JSON, so rebuild the registry to pick up changes from that URL.

- Set `type` to `url`
- Set `path` to a full `http` or `https` URL
- Set `target` to the destination path in the project

```json
{
	"type": "url",
	"path": "https://raw.githubusercontent.com/user/repo/main/.prettierrc",
	"target": ".prettierrc"
}
```

## Add Inline Content

Use `"type": "file"` with `content` instead of `path` when the file is short and has no source file, such as an example `.env` file. The build stores the text as written.

- Set `type` to `file`
- Set `content` to the full text of the file
- Set `target` to the destination path, because inline content has no `path` to fall back on
- Leave out `path`

```json
{
	"type": "file",
	"content": "EXAMPLE=\"value_here\"",
	"target": ".env"
}
```

## Use Supported Files

The build stops when a file uses an extension remote0 does not support. Images such as `.png` are copied to a separate binary folder instead of being stored as text, and remote0 sets `content` and `isLocalBinary` for them, so you never write those fields for a `path` entry.

- Use web files such as `.html`, `.css`, and `.scss`
- Use JavaScript and TypeScript files such as `.js`, `.mjs`, `.ts`, and `.tsx`
- Use framework files such as `.svelte`, `.svx`, `.vue`, and `.astro`
- Use data files such as `.json`, `.yaml`, `.toml`, `.sql`, and `.prisma`
- Use text files such as `.txt`, `.md`, and `.mdx`
- Use script files such as `.sh`, `.bash`, `.zsh`, `.ps1`, and `.bat`
- Use config files such as `.gitignore`, `.prettierrc`, `.npmrc`, and `.env.example`
- Use images such as `.svg`, `.png`, `.jpg`, `.webp`, `.gif`, `.ico`, and `.avif`

## Link Item Dependencies

Use `itemDependencies` when an item needs files from another item, such as an auth item that needs a base auth item. A relative URL resolves against the URL of the item that lists it, so items on the same server can link with paths like `/r/auth-base.json`.

- Add a relative URL such as `/r/auth-base.json` for items on the same server
- Add a full URL such as `https://example.com/r/button.json` for items on another server
- Avoid loops between items, because `add` stops when it finds one

```json
{
	"name": "auth-github",
	"itemDependencies": ["/r/auth-base.json", "/r/mongodb.json"],
	"files": []
}
```

## Build a Registry

The `build` command reads `registry.json`, validates it, and writes one JSON file per item. Host the output folder on any static server, and each item becomes available at a URL ending in `/r/<item-name>.json`.

- Run `npx remote0 build` to read `registry.json` from the current directory
- Pass a path such as `npx remote0 build path/to/registry.json` to use another registry file
- Create a `static/` or `public/` folder first, because the build stops without one
- Find item JSON files in `static/r/`, or in `public/r/` when `static/` does not exist
- Find binary images in `r/binary/` inside the same folder

```text
public/
└── r/
    ├── <item-name>.json
    └── binary/
        └── <encoded-file-name>.<extension>
```

## Add an Item

The `add` command takes the URL of a generated item JSON file. It installs the item's item dependencies first and installs each item only once per run.

- Run `npx remote0 add <item-url>` with the URL of a generated item JSON file
- Use an `http` or `https` URL

```bash
npx remote0 add https://remote0.dev/r/button.json
```

## Existing Files

When some of an item's files already exist in your project, remote0 lists them and asks what to do. Files you choose not to overwrite keep their current content.

- Choose `Overwrite all` to replace every existing file
- Choose `Select files to overwrite` to pick files one by one
- Choose `Cancel` to stop the command
- Pass `--overwrite` to replace existing files without a prompt

## Package Manager

remote0 installs packages only when an item lists `dependencies` or `devDependencies`. It picks the package manager from the lock file in the current directory and checks lock files in this order.

- Use Bun when `bun.lock` or `bun.lockb` exists
- Use pnpm when `pnpm-lock.yaml` exists
- Use Yarn when `yarn.lock` exists
- Use npm when `package-lock.json` exists

## No Lock File

When the current directory has no lock file, remote0 asks which package manager to use. It asks once and reuses your answer for every item in the run, and the package manager you choose creates its lock file during the install.

- Pick `npm`, `pnpm`, `yarn`, or `bun` from the prompt
- Cancel the prompt to stop the command

## Troubleshooting

Most surprises come from running an older remote0 release or running it from the wrong folder. Versions before `0.0.8` have no package manager prompt and always fall back to npm.

- Check the remote0 version when the package manager prompt does not appear
- Ignore the `Done in ... using pnpm` line, because `pnx` prints it, not remote0
- Run remote0 from the project root so it finds the right lock file
