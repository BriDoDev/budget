import type { YnabPlan, YnabPlanExportResponse } from "./types";

const YNAB_API_BASE_URL = "https://api.ynab.com/v1";

export class YnabApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "YnabApiError";
  }
}

export interface PlanExport {
  plan: YnabPlan;
  serverKnowledge: number;
}

export interface FetchPlanOptions {
  /** When set, YNAB returns only the entities changed since that knowledge (deleted ones included). */
  lastKnowledgeOfServer?: number | null;
  fetchImpl?: typeof fetch;
}

/**
 * Downloads a plan export (accounts, categories, months, transactions...).
 * `planId` accepts the special values "last-used" and "default".
 */
export async function fetchPlanExport(
  accessToken: string,
  planId: string,
  { lastKnowledgeOfServer, fetchImpl = fetch }: FetchPlanOptions = {},
): Promise<PlanExport> {
  const url = new URL(`${YNAB_API_BASE_URL}/plans/${encodeURIComponent(planId)}`);
  if (lastKnowledgeOfServer != null) {
    url.searchParams.set("last_knowledge_of_server", String(lastKnowledgeOfServer));
  }
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new YnabApiError(response.status, `YNAB API ${response.status}: ${detail}`);
  }

  const body = (await response.json()) as YnabPlanExportResponse;
  return { plan: body.data.plan, serverKnowledge: body.data.server_knowledge };
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { name?: string; detail?: string } };
    return body.error?.detail ?? body.error?.name ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
