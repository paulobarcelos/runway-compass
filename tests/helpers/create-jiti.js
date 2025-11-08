/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const jitiModule = require("jiti");

const createJiti =
  typeof jitiModule === "function" ? jitiModule : jitiModule.createJiti;

const projectRoot = path.resolve(__dirname, "..", "..", "src");

function createTestJiti(filename, options = {}) {
  const alias = {
    "@": projectRoot,
    "@/": `${projectRoot}/`,
    ...(options.alias ?? {}),
  };

  const extensions =
    options.extensions ??
    [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];

  const merged = {
    ...options,
    alias,
    extensions,
  };

  return createJiti(filename, merged);
}

module.exports = { createTestJiti };
