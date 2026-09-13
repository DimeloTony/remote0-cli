# `dev`

The `dev` directory contains development fixtures and local Codex skill files for
`remote0`. It is separate from the main implementation in `src/` and the
compiled package in `dist/`.

## Directory layout

```text
dev/
├── app/
│   ├── cli/
│   │   ├── index.ts
│   │   ├── schemas.ts
│   │   └── utils/index.ts
│   ├── public/
│   │   ├── images/
│   │   └── registry.json
│   └── remote0/images/shadcn.png
└── skills/
    └── update-comments/
        ├── SKILL.md
        └── agents/openai.yaml
```

## `dev/app`

`dev/app` is a sample destination project used to exercise registry items. The
paths in the root `remote.json` manifest point into this directory, so it shows
what a consumer project might receive from `remote0 add`.

### `dev/app/cli`

This is a generated snapshot of selected CLI files from `src/`:

- `index.ts` is the command-line entry point. It accepts `build` and `add` and
  dispatches to the corresponding command handler.
- `schemas.ts` contains the Zod schemas and inferred TypeScript types for files,
  registry items, and registries.
- `utils/index.ts` contains shared helpers for logging, reading local or remote
  JSON and files, validating schemas, checking supported extensions, encoding
  paths, and installing dependencies.

The snapshot is not a standalone application at the moment. `index.ts` expects
`commands/build.js` and `commands/add.js`, while `utils/index.ts` expects
`data.js`; those files are not currently included under `dev/app/cli`. The
authoritative, complete implementation remains under `src/`.

### `dev/app/public`

This directory contains public-facing test data and image fixtures:

- `images/` contains local PNG, SVG, and ICO assets used by the `test` registry
  item.
- `registry.json` is a checked-in registry-schema fixture based on the shadcn
  registry format.

The current `remote.json` manifest names the URL-backed target as
`dev/app/public/remote.json`, while the checked-in fixture is named
`registry.json`. Treat this as a filename mismatch in the current development
snapshot when regenerating or debugging the fixture.

### `dev/app/remote0`

`remote0/images/shadcn.png` is a binary image downloaded from the URL in
`remote.json`. It demonstrates where a URL-backed binary file is intended to be
restored when a registry item is added.

## `dev/skills/update-comments`

This is a local Codex skill for documenting source code. `SKILL.md` defines the
workflow and constraints for adding concise comments and schema descriptions
without changing behavior. `agents/openai.yaml` provides the skill's display
metadata.

This skill is independent of the `remote.json` registry fixture and is not part
of the published CLI package.

## How the fixture is produced

The root [`remote.json`](../remote.json) is the registry definition. It has two
items:

- `cli` copies selected TypeScript files from `src/` into `dev/app/cli` and
  declares the CLI dependencies.
- `test` copies local images and downloads the shadcn registry schema and image
  into `dev/app`.

From the repository root, build the registry with:

```bash
bun run build
```

The build reads `remote.json`, validates it, embeds text files into generated
item JSON, and copies binary images into `public/r/binary/`. The generated item
files are written to `public/r/cli.json` and `public/r/test.json`.

The root README documents the intended `build` and `add` workflows. Keep in
mind that the current `src/commands/add.ts` returns immediately after checking
for existing files, so the add workflow does not yet write the fixture files
until that implementation is completed.

## Maintenance guidance

- Make source changes in `src/`, not in generated files under `dev/app/cli`.
- Update `remote.json` when changing what the fixture should contain.
- Rebuild from the repository root after changing the registry definition or
  source files.
- Do not treat `dev/app` as a package with its own dependencies or build
  configuration; it currently has neither a `package.json` nor a `tsconfig`.
- Keep `dev/skills` changes separate from registry-fixture changes because the
  skill is maintained as local development tooling.
