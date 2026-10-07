# Project

remote0 is a TypeScript CLI for building file registries and adding registry items to a project from a URL. It runs on Node.js with ES modules, uses Zod for registry validation, and uses @clack/prompts for CLI output and prompts.

## Important Files

- `src/index.ts` — Parses CLI arguments, rejects unsupported commands, and dispatches `build` or `add`.
- `src/commands/build.ts` — Reads registry definitions and file sources, then generates item JSON and binary assets.
- `src/commands/add.ts` — Fetches items, resolves item dependencies, handles file overwrites, and installs files and packages.
- `src/schemas.ts` — Zod validation rules and inferred types for registry definitions, generated items, and file entries.
- `src/data.ts` — Allowed command names, supported file extensions, and binary image extensions.
- `src/utils.ts` — File and URL reads, validation, path safety, extension checks, encoding, logging, and package manager detection.
- `src/dev/` — Local static server (`server.ts`), JSON schema generator (`create.ts`), and prompt demos (`test.ts`).
- `tests/` — Node.js tests for utilities, schemas, build/add behavior, inline files, binary assets, and item dependencies.
- `registry.json` — Example CLI and test items with local files, URLs, inline content, target paths, and dependencies.

## Format

- Follow the existing conventions of nearby files, including formatting, naming, structure, and code flow.
- Preserve existing style and behavior unless changes are explicitly requested.
- Do not refactor, reformat, or modify unrelated code.

## Scope and Tools

- Only perform the requested task. Avoid unrelated changes or improvements.
- Do not create, modify, move, rename, or delete files outside the requested scope.
- Prefer minimal, targeted changes over unnecessary restructuring.
- Use the Important Files map to locate files directly.
- Avoid unnecessary directory listings, searches, or reading unrelated files. Verify paths only when needed.
- Only inspect files and run commands, tools, or tests relevant to the task.
- Do not change dependencies, configurations, or project settings unless required.
- Never run destructive commands or overwrite existing work without authorization.
- Ask for clarification when the scope is unclear rather than making risky assumptions.b

## Simplicity

- Keep solutions simple, minimal, and straightforward.
- Do not overengineer or introduce unnecessary complexity.
- Prefer existing patterns and utilities over new abstractions.
- Avoid unnecessary components, helpers, wrappers, or layers.
- Do not add features, flexibility, or future-proofing that was not requested.
- Write clear, readable, and maintainable code without excessive boilerplate.
- Choose the simplest solution that fully satisfies the requirements.
