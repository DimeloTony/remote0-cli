import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, relative, resolve } from "node:path";

/** Directory whose files are served by the development server */
const PUBLIC_DIR = `${process.cwd()}/public`;
/** Port used by the development server, defaulting to 4002 */
const PORT = Number(process.env.PORT) || 4002;

/** Maps file extensions to their response MIME types */
const MIME_TYPES: Record<string, string> = {
	".css": "text/css; charset=utf-8",
	".gif": "image/gif",
	".html": "text/html; charset=utf-8",
	".ico": "image/x-icon",
	".jpeg": "image/jpeg",
	".jpg": "image/jpeg",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".md": "text/markdown; charset=utf-8",
	".png": "image/png",
	".svg": "image/svg+xml",
	".ts": "text/typescript; charset=utf-8",
	".txt": "text/plain; charset=utf-8",
	".webp": "image/webp",
};

/** Escapes HTML-sensitive characters before inserting text into generated markup */
function escapeHtml(value: string) {
	return value.replace(
		/[&<>'"]/g,
		(character) =>
			({
				"&": "&amp;",
				"<": "&lt;",
				">": "&gt;",
				"'": "&#39;",
				'"': "&quot;",
			})[character] ?? character,
	);
}

/** Renders a directory listing as an HTML document */
async function renderDirectory(directoryPath: string, requestPath: string) {
	const entries = (await readdir(directoryPath, { withFileTypes: true })).sort((a, b) => {
		if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
		return a.name.localeCompare(b.name);
	});

	const parentPath = requestPath !== "/" ? `${requestPath.split("/").slice(0, -2).join("/") || "/"}` : null;
	const links = entries
		.map((entry) => {
			const entryPath = requestPath === "/" ? `/${entry.name}` : `${requestPath}${entry.name}`;
			const href = entry.isDirectory() ? `${entryPath}/` : entryPath;
			const label = entry.isDirectory() ? `${entry.name}/` : entry.name;
			return `<li><a href="${encodeURI(href)}">${escapeHtml(label)}</a></li>`;
		})
		.join("\n");

	return `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8">
		<meta name="viewport" content="width=device-width, initial-scale=1">
		<title>Files in ${escapeHtml(requestPath)}</title>
		<style>
			body { max-width: 60rem; margin: 2rem auto; padding: 0 1rem; font: 1rem/1.5 system-ui, sans-serif; }
			h1 { font-size: 1.5rem; }
			ul { padding-left: 1.5rem; }
			li { margin: .35rem 0; }
			a { color: #06c; }
		</style>
	</head>
	<body>
		<h1>Files in ${escapeHtml(requestPath)}</h1>
		${parentPath ? `<p><a href="${parentPath}">..</a></p>` : ""}
		<ul>${links || "<li>No files</li>"}</ul>
	</body>
</html>`;
}

/** Serves files and directory listings from the public directory over HTTP */
const server = createServer(async (request, response) => {
	if (!request.url || !["GET", "HEAD"].includes(request.method ?? "")) {
		response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
		response.end("Method Not Allowed");
		return;
	}

	try {
		const requestUrl = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
		const requestPath = decodeURIComponent(requestUrl.pathname);
		const requestedPath = resolve(PUBLIC_DIR, `.${requestPath}`);

		if (requestedPath !== PUBLIC_DIR && !requestedPath.startsWith(`${PUBLIC_DIR}/`)) {
			response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
			response.end("Forbidden");
			return;
		}

		const requestedStats = await stat(requestedPath);
		if (requestedStats.isDirectory()) {
			const directoryUrl = requestPath.endsWith("/") ? requestPath : `${requestPath}/`;
			if (directoryUrl !== requestPath) {
				response.writeHead(301, { Location: directoryUrl });
				response.end();
				return;
			}

			const body = await renderDirectory(requestedPath, requestPath);
			response.writeHead(200, {
				"Content-Length": Buffer.byteLength(body),
				"Content-Type": "text/html; charset=utf-8",
			});
			response.end(request.method === "HEAD" ? undefined : body);
			return;
		}

		response.writeHead(200, {
			"Content-Length": requestedStats.size,
			"Content-Type": MIME_TYPES[extname(requestedPath).toLowerCase()] ?? "application/octet-stream",
		});
		if (request.method === "HEAD") response.end();
		else createReadStream(requestedPath).pipe(response);
	} catch (error: unknown) {
		const statusCode = error instanceof URIError ? 400 : 404;
		response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
		response.end(statusCode === 400 ? "Bad Request" : "Not Found");
	}
});

server.listen(PORT, () => {
	console.log(`Running dev server at http://localhost:${PORT}`);
});
