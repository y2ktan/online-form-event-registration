/**
 * Workaround for exceljs + vitest ESM/CJS conflict.
 *
 * uuid@8/9 ships a "module" field and "exports.node.module" that point to
 * ESM files (.js with export syntax) inside a CJS package (no "type": "module").
 * Vitest's vite-node resolves the ESM entry, causing a SyntaxError.
 *
 * This script patches uuid's package.json to always resolve to the CJS entry.
 */

const fs = require("fs");
const path = require("path");

const uuidPkgPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "exceljs",
  "node_modules",
  "uuid",
  "package.json"
);

if (!fs.existsSync(uuidPkgPath)) {
  // uuid might be hoisted or exceljs not installed yet — skip silently
  process.exit(0);
}

try {
  const pkg = JSON.parse(fs.readFileSync(uuidPkgPath, "utf-8"));

  let changed = false;

  if (pkg.module) {
    delete pkg.module;
    changed = true;
  }

  if (pkg.exports?.["."]?.node?.module) {
    pkg.exports["."] = {
      require: "./dist/index.js",
      import: "./dist/index.js",
      default: "./dist/index.js",
    };
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(uuidPkgPath, JSON.stringify(pkg, null, 2) + "\n");
    console.log("[fix-uuid-esm] Patched exceljs/uuid for CJS compatibility.");
  }
} catch {
  // Non-critical — skip silently
}
