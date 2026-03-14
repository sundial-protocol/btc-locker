import { readdir, readFile, writeFile, stat } from "fs/promises";
import { join, extname, dirname, resolve } from "path";

/**
 * Check if a relative import path points to a directory (with index.js)
 * rather than a file. Must be checked against the filesystem.
 */
async function isDirectoryImport(fromFile, importPath) {
  const dir = dirname(fromFile);
  const resolved = resolve(dir, importPath);
  try {
    const s = await stat(resolved);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function fixImports(dir) {
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await fixImports(fullPath);
    } else if (entry.isFile() && extname(entry.name) === ".js") {
      let content = await readFile(fullPath, "utf8");
      const lines = content.split("\n");
      const fixedLines = [];

      for (const line of lines) {
        let fixed = line;

        // Match: from "./path" or from "../path"
        const fromMatch = fixed.match(/(from\s+['"])(\.{1,2}\/[^'"]*?)(['"])/);
        if (fromMatch) {
          const [, prefix, importPath, quote] = fromMatch;
          if (
            !importPath.includes("?") &&
            !importPath.endsWith(".js") &&
            !importPath.endsWith(".mjs") &&
            !importPath.endsWith(".cjs")
          ) {
            if (await isDirectoryImport(fullPath, importPath)) {
              fixed = fixed.replace(
                fromMatch[0],
                prefix + importPath + "/index.js" + quote,
              );
            } else {
              fixed = fixed.replace(
                fromMatch[0],
                prefix + importPath + ".js" + quote,
              );
            }
          }
        }

        fixedLines.push(fixed);
      }

      const newContent = fixedLines.join("\n");
      if (newContent !== content) {
        await writeFile(fullPath, newContent);
      }
    }
  }
}

// Fix imports in ESM build
await fixImports("./dist/esm");
