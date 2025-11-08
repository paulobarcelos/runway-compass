// ABOUTME: Dedicated categories manager route with shared header/navigation.
import { CategoryManager } from "@/components/categories/category-manager";
import { getCategories } from "@/app/(authenticated)/actions/categories-actions";
import { queryKeys } from "@/lib/query";
import { withManagerPrefetch } from "../with-manager-prefetch";
import type { ManagerPrefetchFn } from "../with-manager-prefetch";

const managerPrefetch: ManagerPrefetchFn = async ({ queryClient, spreadsheetId }) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.categories(spreadsheetId),
    queryFn: () => getCategories({ spreadsheetId }),
  });
};

async function CategoriesManagerPage() {
  return <CategoryManager />;
}

export default withManagerPrefetch(CategoriesManagerPage, managerPrefetch);
