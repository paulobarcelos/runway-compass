// ABOUTME: Writes manifest metadata into the selected Google Sheet.
// ABOUTME: Normalizes meta tab key-value persistence for server actions.
import type { sheets_v4 } from "googleapis";

interface StoreMetaParams {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

const META_RANGE = "_meta!A1:B1";

function isMissingMetaSheet(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message.includes("_meta") || error.message.includes("Unable to parse range");
}

export async function storeSelectedSpreadsheetMeta({
  sheets,
  spreadsheetId,
}: StoreMetaParams) {
  if (!spreadsheetId) {
    throw new Error("Missing spreadsheet identifier");
  }

  const request = {
    spreadsheetId,
    range: META_RANGE,
    valueInputOption: "RAW" as const,
    resource: {
      values: [["selected_spreadsheet_id", spreadsheetId]],
    },
  };

  try {
    await sheets.spreadsheets.values.update(request);
  } catch (error) {
    if (!isMissingMetaSheet(error)) {
      throw error;
    }

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
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

    await sheets.spreadsheets.values.update(request);
  }
}
