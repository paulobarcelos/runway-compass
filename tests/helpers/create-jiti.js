/* eslint-disable @typescript-eslint/no-require-imports */
const path = require("node:path");
const { createJiti } = require("jiti");

const projectRoot = path.resolve(__dirname, "..", "..", "src");

function createTestJiti(filename, options = {}) {
  const alias = {
    "@": projectRoot,
    "@/": `${projectRoot}/`,
    ...(options.alias ?? {}),
  };

  const merged = {
    ...options,
    alias,
  };

  return createJiti(filename, merged);
}

module.exports = { createTestJiti };
