/** File extensions treated as binary image files */
export const BINARY_IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];

/** Command names supported by the CLI */
export const COMMANDS = ["build", "add"] as const;

/** File extensions commonly used for web assets and stylesheets */
export const WEB_EXTS = [".html", ".htm", ".css", ".scss", ".sass", ".less"];

/** File extensions used for JavaScript source files */
export const JAVASCRIPT_EXTS = [".js", ".jsx", ".mjs", ".cjs"];

/** File extensions used for TypeScript source files */
export const TYPESCRIPT_EXTS = [".ts", ".tsx", ".mts", ".cts"];

/** File extensions used for structured data files */
export const DATA_EXTS = [".json", ".jsonc", ".yaml", ".yml", ".toml", ".xml"];

/** File extensions used for plain-text and Markdown files */
export const TEXT_EXTS = [".txt", ".md", ".mdx"];

/** File extensions used for image files, including SVG and raster formats */
export const IMAGES_EXTS = [".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico"];

/** File extensions used for supported frontend framework files */
export const FRAMEWORK_EXTS = [".vue", ".svelte"];

/** All file extensions accepted by the application */
export const ALLOW_FILE_EXTS = [...WEB_EXTS, ...JAVASCRIPT_EXTS, ...TYPESCRIPT_EXTS, ...DATA_EXTS, ...TEXT_EXTS, ...IMAGES_EXTS, ...FRAMEWORK_EXTS];
