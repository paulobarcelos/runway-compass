import { AccountsManager } from "@/components/accounts/accounts-manager";
import { withManagerPrefetch } from "../with-manager-prefetch";
import type { ManagerPrefetchFn } from "../with-manager-prefetch";

const managerPrefetch: ManagerPrefetchFn = async () => {
  // Accounts manager currently hydrates via client-side data sources.
};

async function AccountsManagerPage() {
  return <AccountsManager />;
}

export default withManagerPrefetch(AccountsManagerPage, managerPrefetch);
