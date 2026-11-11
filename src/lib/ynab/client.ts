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

/**
 * Downloads the full export of a plan (accounts, categories, months,
 * transactions...). `planId` accepts the special values "last-used" and "default".
 */
export async function fetchPlanExport(
  accessToken: string,
  planId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<YnabPlan> {
  const response = await fetchImpl(`${YNAB_API_BASE_URL}/plans/${encodeURIComponent(planId)}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new YnabApiError(response.status, `YNAB API ${response.status}: ${detail}`);
  }

  const body = (await response.json()) as YnabPlanExportResponse;
  return body.data.plan;
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { name?: string; detail?: string } };
    return body.error?.detail ?? body.error?.name ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
