import { BudgetPlanManager } from "@/components/budget-plan/budget-plan-manager";
import { getBudgetPlan } from "@/app/(authenticated)/actions/budget-plan-actions";
import { queryKeys } from "@/lib/query";
import { withManagerPrefetch } from "../with-manager-prefetch";
import type { ManagerPrefetchFn } from "../with-manager-prefetch";

const managerPrefetch: ManagerPrefetchFn = async ({ queryClient, spreadsheetId }) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.budgetPlan(spreadsheetId),
    queryFn: () => getBudgetPlan({ spreadsheetId }),
  });
};

async function BudgetPlanManagerPage() {
  return <BudgetPlanManager />;
}

export default withManagerPrefetch(BudgetPlanManagerPage, managerPrefetch);
