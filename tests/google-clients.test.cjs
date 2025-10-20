// ABOUTME: Ensures Google API helpers configure clients correctly.
// ABOUTME: Validates Sheets meta persistence payloads.
/* eslint-disable @typescript-eslint/no-require-imports */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createJiti } = require("jiti");

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

test("createSheetsClient configures OAuth credentials", async () => {
  const jiti = createJiti(__filename);
  const googleStub = createGoogleStub();
  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createSheetsClient } = await jiti.import(
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
  const jiti = createJiti(__filename);
  const getCalls = [];
  const updateCalls = [];
  let storedValues = [];

  const sheetsClient = {
    spreadsheets: {
      values: {
        get: async (request) => {
          getCalls.push(request);
          return {
            data: {
              values: storedValues,
            },
          };
        },
        update: async (request) => {
          updateCalls.push(request);
          storedValues = request.resource.values;
          return { status: 200 };
        },
      },
      batchUpdate: async () => {
        throw new Error("batchUpdate should not be called");
      },
    },
  };

  const { storeSelectedSpreadsheetMeta } = await jiti.import(
    "../src/server/google/meta",
  );

  await storeSelectedSpreadsheetMeta({
    sheets: sheetsClient,
    spreadsheetId: "sheet-123",
  });

  assert.equal(getCalls.length, 1);
  assert.equal(updateCalls.length, 1);
  assert.deepEqual(updateCalls[0], {
    spreadsheetId: "sheet-123",
    range: "_meta!A1:B2",
    valueInputOption: "RAW",
    resource: {
      values: [
        ["key", "value"],
        ["selected_spreadsheet_id", "sheet-123"],
      ],
    },
  });
  assert.deepEqual(storedValues, [
    ["key", "value"],
    ["selected_spreadsheet_id", "sheet-123"],
  ]);
});

test("storeSelectedSpreadsheetMeta creates _meta sheet when missing", async () => {
  const jiti = createJiti(__filename);
  const getCalls = [];
  const updateCalls = [];
  const batchCalls = [];
  let storedValues = [];
  let firstUpdate = true;

  const sheetsClient = {
    spreadsheets: {
      values: {
        get: async (request) => {
          getCalls.push(request);
          const error = new Error("Unable to parse range: _meta!A1:B100");
          error.code = 400;
          throw error;
        },
        update: async (request) => {
          updateCalls.push(request);

          if (firstUpdate) {
            firstUpdate = false;
            const error = new Error("Unable to parse range: _meta!A1:B2");
            error.code = 400;
            throw error;
          }

          storedValues = request.resource.values;
          return { status: 200 };
        },
      },
      batchUpdate: async (request) => {
        batchCalls.push(request);
        return { status: 200 };
      },
    },
  };

  const { storeSelectedSpreadsheetMeta } = await jiti.import(
    "../src/server/google/meta",
  );

  await storeSelectedSpreadsheetMeta({
    sheets: sheetsClient,
    spreadsheetId: "sheet-123",
  });

  assert.equal(getCalls.length, 1, "meta load attempted before creation");
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
                rowCount: 20,
                columnCount: 2,
                frozenRowCount: 0,
              },
            },
          },
        },
      ],
    },
  });
  assert.deepEqual(storedValues, [
    ["key", "value"],
    ["selected_spreadsheet_id", "sheet-123"],
  ]);
});

test("createSpreadsheet creates Drive spreadsheet", async () => {
  const jiti = createJiti(__filename);
  const credentialsLog = [];
  const createCalls = [];

  class OAuth2 {
    constructor(clientId, clientSecret) {
      this.clientId = clientId;
      this.clientSecret = clientSecret;
    }

    setCredentials(credentials) {
      credentialsLog.push(credentials);
    }
  }

  const googleStub = {
    auth: { OAuth2 },
    drive: ({ version, auth }) => {
      createCalls.push({ version, auth });

      return {
        files: {
          create: async (request) => {
            createCalls.push(request);
            return { data: { id: "sheet-789" } };
          },
        },
      };
    },
  };

  const originalClientId = process.env.GOOGLE_CLIENT_ID;
  const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  process.env.GOOGLE_CLIENT_ID = "test-client-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

  try {
    const { createSpreadsheet } = await jiti.import(
      "../src/server/google/drive",
    );

    const result = await createSpreadsheet({
      tokens: {
        accessToken: "access-123",
        refreshToken: "refresh-456",
        expiresAt: 1730000000,
      },
      googleModule: googleStub,
      title: "Runway Compass",
    });

    assert.equal(result.spreadsheetId, "sheet-789");
    assert.equal(credentialsLog.length, 1);
    assert.deepEqual(credentialsLog[0], {
      access_token: "access-123",
      refresh_token: "refresh-456",
      expiry_date: 1730000000,
    });
    assert.equal(createCalls.length, 2);
    assert.deepEqual(createCalls[1], {
      requestBody: {
        mimeType: "application/vnd.google-apps.spreadsheet",
        name: "Runway Compass",
      },
      fields: "id",
    });
  } finally {
    process.env.GOOGLE_CLIENT_ID = originalClientId;
    process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
  }
});
