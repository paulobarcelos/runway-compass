// ABOUTME: Exposes single-flow mutation handlers for cash flows API.
// ABOUTME: Routes PATCH and DELETE requests through the shared handler factory.
import { createCashFlowsHandler } from "../cash-flows-handler";

const handlers = createCashFlowsHandler();

function extractFlowId(request: Request) {
  const url = new URL(request.url);
  const segments = url.pathname.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "";
}

export async function PATCH(request: Request) {
  const flowId = extractFlowId(request);
  return handlers.PATCH(request, { params: { flowId } });
}

export async function DELETE(request: Request) {
  const flowId = extractFlowId(request);
  return handlers.DELETE(request, { params: { flowId } });
}
