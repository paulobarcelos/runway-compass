// ABOUTME: Connects the runway timeline hook to the presentational view.
// ABOUTME: Exposes the component for inclusion on the dashboard.
"use client";

import { RunwayTimelineView } from "./runway-timeline-view";
import { useRunwayTimeline } from "./use-runway-timeline";

export function RunwayTimeline() {
  const timeline = useRunwayTimeline();
  return <RunwayTimelineView timeline={timeline} />;
}
