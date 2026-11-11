import "server-only";
import type { HouseholdInviteRow, HouseholdRow } from "../db/types";
import { createClient } from "../supabase/server";

export interface HouseholdPerson {
  user_id: string;
  email: string;
  role: "owner" | "member";
}

export interface HouseholdOverview {
  household: HouseholdRow;
  people: HouseholdPerson[];
  invites: HouseholdInviteRow[];
}

/** Households of the signed-in user, accepting any pending invite for their e-mail first. */
export async function listHouseholds(): Promise<HouseholdRow[]> {
  const supabase = await createClient();
  const { error: inviteError } = await supabase.rpc("accept_household_invites");
  if (inviteError) {
    throw new Error(`Could not accept invites: ${inviteError.message}`);
  }
  const { data, error } = await supabase.from("households").select("id, name").order("created_at");
  if (error) {
    throw new Error(`Could not load households: ${error.message}`);
  }
  return (data ?? []) as HouseholdRow[];
}

export async function getHouseholdOverview(household: HouseholdRow): Promise<HouseholdOverview> {
  const supabase = await createClient();
  const [people, invites] = await Promise.all([
    supabase.rpc("household_people", { target_household_id: household.id }),
    supabase
      .from("household_invites")
      .select("household_id, email, created_at")
      .eq("household_id", household.id)
      .order("created_at"),
  ]);
  if (people.error) {
    throw new Error(`Could not load members: ${people.error.message}`);
  }
  if (invites.error) {
    throw new Error(`Could not load invites: ${invites.error.message}`);
  }
  return {
    household,
    people: (people.data ?? []) as HouseholdPerson[],
    invites: (invites.data ?? []) as HouseholdInviteRow[],
  };
}
