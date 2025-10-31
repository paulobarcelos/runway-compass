// ABOUTME: Sheet fixture with simplified ledger rows for API and projection tests.

const CASH_FLOW_SHEET_VALUES = [
  [
    "flow_id",
    "date",
    "amount",
    "status",
    "account_id",
    "category_id",
    "note",
  ],
  [
    "flow-planned",
    "2025-02-05",
    "3500",
    "planned",
    "acct-operating",
    "cat-consulting",
    "Consulting retainer",
  ],
  [
    "flow-posted",
    "2025-02-01",
    "-1800",
    "posted",
    "acct-operating",
    "cat-rent",
    "Rent invoice",
  ],
];

const CASH_FLOW_EXPECTED_ENTRIES = [
  {
    flowId: "flow-planned",
    date: "2025-02-05",
    amount: 3500,
    status: "planned",
    accountId: "acct-operating",
    categoryId: "cat-consulting",
    note: "Consulting retainer",
  },
  {
    flowId: "flow-posted",
    date: "2025-02-01",
    amount: -1800,
    status: "posted",
    accountId: "acct-operating",
    categoryId: "cat-rent",
    note: "Rent invoice",
  },
];

module.exports = {
  CASH_FLOW_SHEET_VALUES,
  CASH_FLOW_EXPECTED_ENTRIES,
};
