import { withManagerPrefetch } from "../with-manager-prefetch";

async function RunwayManagerPlaceholder() {
  return (
    <section className="rounded-2xl border border-dashed border-zinc-200/80 bg-zinc-50/70 p-6 text-sm text-zinc-700 shadow-inner shadow-white/40 dark:border-zinc-700/60 dark:bg-zinc-950/50 dark:text-zinc-200">
      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Runway timeline coming soon</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        We&apos;re building a dedicated runway experience. Check back for projections that stitch categories, accounts, and ledger data into a unified timeline.
      </p>
    </section>
  );
}

export default withManagerPrefetch(RunwayManagerPlaceholder);
