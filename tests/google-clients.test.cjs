// ABOUTME: Ensures Google API helpers configure clients correctly.
// ABOUTME: Validates Sheets meta persistence payloads.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const createLoader = require("jiti");

function createGoogleStub() {
  const credentialsLog = [];
  const sheetCalls = [];

  class OAuth2 {
    constructor(clientId, clientSecret) {
      this.clientId = clientId;
      this.clientSecret = clientSecret;
    }

    setCredentials(credentials) {
      credentialsLog.push(credentials);
    }
  }

  function sheets(options) {
    sheetCalls.push(options);
    return { api: "sheets", options };
  }

  return {
    auth: { OAuth2 },
    sheets,
    __credentialsLog: credentialsLog,
    __sheetCalls: sheetCalls,
  };
}

test("createSheetsClient configures OAuth credentials", () => {
  const loader = createLoader(__filename, { cache: false });
  const googleStub = createGoogleStub();
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createSheetsClient } = loader(
      "../src/server/google/clients",
    );

    const sheetsClient = createSheetsClient(
      {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: 1730000000,
      },
      googleStub,
    );

    assert.equal(sheetsClient.api, "sheets");
    assert.equal(googleStub.__sheetCalls.length, 1);
    assert.equal(googleStub.__sheetCalls[0].version, "v4");
    assert.equal(googleStub.__credentialsLog.length, 1);
    assert.deepEqual(googleStub.__credentialsLog[0], {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expiry_date: 1730000000,
    });
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});

test("storeSelectedSpreadsheetMeta writes key-value pair", async () => {
  const loader = createLoader(__filename, { cache: false });
  const calls = [];
  const sheetsClient = {
    spreadsheets: {
      values: {
        update: async (request) => {
          calls.push(request);
          return { status: 200 };
        },
      },
    },
  };

  const { storeSelectedSpreadsheetMeta } = loader(
    "../src/server/google/meta",
  );

  await storeSelectedSpreadsheetMeta({
    sheets: sheetsClient,
    spreadsheetId: "sheet-123",
  });

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    spreadsheetId: "sheet-123",
    range: "_meta!A1:B1",
    valueInputOption: "RAW",
    resource: {
      values: [["selected_spreadsheet_id", "sheet-123"]],
    },
  });
});

test("storeSelectedSpreadsheetMeta creates _meta sheet when missing", async () => {
  const loader = createLoader(__filename, { cache: false });
  const updateCalls = [];
  const batchCalls = [];

  const sheetsClient = {
    spreadsheets: {
      values: {
        update: async (request) => {
          updateCalls.push(request);

          if (updateCalls.length === 1) {
            const error = new Error("Unable to parse range: _meta!A1:B1");
            error.code = 400;
            throw error;
          }

          return { status: 200 };
        },
      },
      batchUpdate: async (request) => {
        batchCalls.push(request);
        return { status: 200 };
      },
    },
  };

  const { storeSelectedSpreadsheetMeta } = loader(
    "../src/server/google/meta",
  );

  await storeSelectedSpreadsheetMeta({
    sheets: sheetsClient,
    spreadsheetId: "sheet-123",
  });

  assert.equal(updateCalls.length, 2, "update retried after creating meta sheet");
  assert.equal(batchCalls.length, 1, "meta sheet created via batchUpdate");
  assert.deepEqual(batchCalls[0], {
    spreadsheetId: "sheet-123",
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: "_meta",
              sheetType: "GRID",
              hidden: true,
              gridProperties: {
                rowCount: 10,
                columnCount: 2,
              },
            },
          },
        },
      ],
    },
  });
});
