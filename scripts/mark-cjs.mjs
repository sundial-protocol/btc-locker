// Marks a CommonJS build folder as CommonJS. The packages are "type": "module",
// so without this Node reads dist/cjs/*.js as ES modules and require() fails.
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2] ?? "dist/cjs";
writeFileSync(join(dir, "package.json"), JSON.stringify({ type: "commonjs" }) + "\n");
