import { CashPlannerManager } from "@/components/cash-planner/cash-planner-manager";
import { withManagerPrefetch } from "../with-manager-prefetch";
import type { ManagerPrefetchFn } from "../with-manager-prefetch";

const managerPrefetch: ManagerPrefetchFn = async () => {
  // Ledger manager loads data via hooks after mount.
};

async function LedgerManagerPage() {
  return <CashPlannerManager />;
}

export default withManagerPrefetch(LedgerManagerPage, managerPrefetch);
