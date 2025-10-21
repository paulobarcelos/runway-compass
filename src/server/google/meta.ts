// ABOUTME: Writes manifest metadata into the selected Google Sheet.
// ABOUTME: Normalizes meta tab key-value persistence for server actions.
import type { sheets_v4 } from "googleapis";

import { executeWithRetry } from "./retry";
import { createMetaRepository } from "./repository/meta-repository";
import { META_SHEET_SCHEMA, sheetPropertiesFor } from "./sheet-schemas";

interface StoreMetaParams {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

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

  const repository = createMetaRepository({ sheets, spreadsheetId });
  const entries = await repository.load();

  entries.set("selected_spreadsheet_id", spreadsheetId);

  try {
    await repository.save(entries);
  } catch (error) {
    if (!isMissingMetaSheet(error)) {
      throw error;
    }

    await executeWithRetry(() =>
      sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: sheetPropertiesFor(META_SHEET_SCHEMA),
              },
            },
          ],
        },
      }),
    );

    await repository.save(entries);
  }
}
