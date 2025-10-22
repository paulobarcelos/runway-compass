/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createTestJiti } = require("./helpers/create-jiti");

function createSheetsStub({
  metadata = {},
} = {}) {
  const getCalls = [];

  const stub = {
    spreadsheets: {
      get: async (request) => {
        getCalls.push(request);
        return { data: metadata };
      },
    },
  };

  return { stub, getCalls };
}

function withEnv(run) {
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  return (async () => {
    try {
      await run();
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  })();
}

test("filterSheetIssues extracts severity-normalized issues", async () => {
  const jiti = createTestJiti(__filename);
  const { filterSheetIssues } = await jiti.import(
    "../src/components/spreadsheet/spreadsheet-health-helpers",
  );

  const diagnostics = {
    warnings: [
      {
        sheetId: "accounts",
        sheetTitle: "Accounts",
        code: "header_mismatch",
        message: "Headers mismatch",
        rowNumber: 4,
      },
      {
        sheetId: "categories",
        sheetTitle: "Categories",
        code: "missing_row",
        message: "Category missing",
      },
    ],
    errors: [
      {
        sheetId: "accounts",
        sheetTitle: "Accounts",
        code: "missing_sheet",
        message: "Accounts tab missing",
      },
      {
        sheetId: "runway_projection",
        sheetTitle: "Runway",
        code: "range_error",
        message: "Range invalid",
      },
    ],
  };

  const result = filterSheetIssues(diagnostics, { sheetId: "accounts" });

  assert.deepEqual(result, {
    sheetId: "accounts",
    sheetTitle: "Accounts",
    sheetGid: null,
    warnings: [
      {
        sheetId: "accounts",
        sheetTitle: "Accounts",
        code: "header_mismatch",
        message: "Headers mismatch",
        rowNumber: 4,
        severity: "warning",
        sheetGid: null,
      },
    ],
    errors: [
      {
        sheetId: "accounts",
        sheetTitle: "Accounts",
        code: "missing_sheet",
        message: "Accounts tab missing",
        rowNumber: null,
        severity: "error",
        sheetGid: null,
      },
    ],
    hasIssues: true,
    hasErrors: true,
  });
});

test("filterSheetIssues returns defaults when nothing matches", async () => {
  const jiti = createTestJiti(__filename);
  const { filterSheetIssues } = await jiti.import(
    "../src/components/spreadsheet/spreadsheet-health-helpers",
  );

  const diagnostics = {
    warnings: [],
    errors: [],
  };

  const result = filterSheetIssues(diagnostics, {
    sheetId: "categories",
    fallbackTitle: "Categories",
  });

  assert.deepEqual(result, {
    sheetId: "categories",
    sheetTitle: "Categories",
    sheetGid: null,
    warnings: [],
    errors: [],
    hasIssues: false,
    hasErrors: false,
  });
});

test("shouldRetryAfterRecovery detects blocking error recovery transitions", async () => {
  const jiti = createTestJiti(__filename);
  const { shouldRetryAfterRecovery } = await jiti.import(
    "../src/components/spreadsheet/spreadsheet-health-helpers",
  );

  assert.equal(shouldRetryAfterRecovery(true, false), true);
  assert.equal(shouldRetryAfterRecovery(false, false), false);
  assert.equal(shouldRetryAfterRecovery(false, true), false);
  assert.equal(shouldRetryAfterRecovery(true, true), false);
});

test("shouldReloadAfterBootstrap flags manifest storedAt changes", async () => {
  const jiti = createTestJiti(__filename);
  const { shouldReloadAfterBootstrap } = await jiti.import(
    "../src/components/spreadsheet/spreadsheet-health-helpers",
  );

  assert.equal(shouldReloadAfterBootstrap(null, null), false);
  assert.equal(shouldReloadAfterBootstrap(null, 1234), false);
  assert.equal(shouldReloadAfterBootstrap(1111, 1111), false);
  assert.equal(shouldReloadAfterBootstrap(1111, 2222), true);
});

test("collectSpreadsheetDiagnostics aggregates repository issues by severity", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { collectSpreadsheetDiagnostics } = await jiti.import(
      "../src/server/google/spreadsheet-health",
    );

    const { stub: sheets } = createSheetsStub({
      metadata: {
        sheets: [
          { properties: { title: "accounts", sheetId: 110 } },
          { properties: { title: "categories", sheetId: 220 } },
          { properties: { title: "snapshots", sheetId: 330 } },
        ],
      },
    });

    const result = await collectSpreadsheetDiagnostics({
      sheets,
      spreadsheetId: "sheet-123",
      loadAccountsDiagnostics: async () => ({
        accounts: [],
        warnings: [
          {
            rowNumber: 5,
            code: "invalid_sort_order",
            message: "Sort order invalid",
          },
        ],
        errors: [
          {
            code: "missing_sheet",
            message: "Accounts tab missing",
          },
        ],
      }),
      loadCategories: async () => {},
      loadSnapshots: async () => {},
    });

    assert.deepEqual(result, {
      warnings: [
        {
          sheetId: "accounts",
          sheetTitle: "Accounts",
          sheetGid: 110,
          severity: "warning",
          code: "invalid_sort_order",
          message: "Sort order invalid",
          rowNumber: 5,
        },
      ],
      errors: [
        {
          sheetId: "accounts",
          sheetTitle: "Accounts",
          sheetGid: 110,
          severity: "error",
          code: "missing_sheet",
          message: "Accounts tab missing",
          rowNumber: null,
        },
      ],
      sheets: [
        {
          sheetId: "accounts",
          sheetTitle: "Accounts",
          sheetGid: 110,
        },
        {
          sheetId: "categories",
          sheetTitle: "Categories",
          sheetGid: 220,
        },
        {
          sheetId: "snapshots",
          sheetTitle: "Snapshots",
          sheetGid: 330,
        },
      ],
    });
  });
});

test("collectSpreadsheetDiagnostics converts thrown errors into sheet diagnostics", async () => {
  await withEnv(async () => {
    const jiti = createTestJiti(__filename);
    const { collectSpreadsheetDiagnostics } = await jiti.import(
      "../src/server/google/spreadsheet-health",
    );

    const { stub: sheets } = createSheetsStub({
      metadata: {
        sheets: [
          { properties: { title: "accounts", sheetId: 110 } },
          { properties: { title: "categories", sheetId: 220 } },
          { properties: { title: "snapshots", sheetId: 330 } },
        ],
      },
    });

    const result = await collectSpreadsheetDiagnostics({
      sheets,
      spreadsheetId: "sheet-456",
      loadAccountsDiagnostics: async () => {
        throw new Error("Failed to load accounts");
      },
      loadCategories: async () => {
        throw new Error("categories header does not match expected schema");
      },
      loadSnapshots: async () => {
        const error = new Error("Missing snapshot sheet");
        error.code = 404;
        throw error;
      },
    });

    assert.equal(result.warnings.length, 0);
    assert.equal(result.errors.length, 3);

    assert.deepEqual(result.errors, [
      {
        sheetId: "accounts",
        sheetTitle: "Accounts",
        sheetGid: 110,
        severity: "error",
        code: "exception",
        message: "Failed to load accounts",
        rowNumber: null,
      },
      {
        sheetId: "categories",
        sheetTitle: "Categories",
        sheetGid: 220,
        severity: "error",
        code: "exception",
        message: "categories header does not match expected schema",
        rowNumber: null,
      },
      {
        sheetId: "snapshots",
        sheetTitle: "Snapshots",
        sheetGid: 330,
        severity: "error",
        code: "404",
        message: "Missing snapshot sheet",
        rowNumber: null,
      },
    ]);
  });
});
