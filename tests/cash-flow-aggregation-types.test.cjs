// ABOUTME: Type-checks the monthly cash flow summary fixture.
// ABOUTME: Ensures summary buckets accept numeric mutations during aggregation.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const ts = require("typescript");

test("monthly cash flow summary buckets support numeric totals", () => {
  const projectDir = path.resolve(__dirname, "..");
  const tsconfigPath = path.join(projectDir, "tsconfig.json");
  const fixturePath = path.join(__dirname, "fixtures", "cash-flow-summary-typecheck.ts");

  const formatHost = {
    getCanonicalFileName(fileName) {
      return fileName;
    },
    getCurrentDirectory() {
      return projectDir;
    },
    getNewLine() {
      return "\n";
    },
  };

  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

  if (config.error) {
    throw new Error(ts.formatDiagnostic(config.error, formatHost));
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic(diagnostic) {
        throw new Error(ts.formatDiagnostic(diagnostic, formatHost));
      },
    },
    projectDir,
    { baseUrl: projectDir },
    tsconfigPath,
  );

  const program = ts.createProgram({
    options: {
      ...parsed.options,
      baseUrl: projectDir,
      noEmit: true,
    },
    rootNames: [fixturePath],
  });

  const diagnostics = [
    ...program.getSyntacticDiagnostics(),
    ...program.getSemanticDiagnostics(),
  ];

  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
  );
});
