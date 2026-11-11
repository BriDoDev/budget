import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createBudget, createHousehold, inviteMember, revokeInvite, syncFromYnab } from "@/app/actions/household";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { cardClass, inputClass, labelClass, linkButtonClass, mutedTextClass, pageClass, secondaryButtonClass } from "@/components/ui";
import { listBudgets, type BudgetSummary } from "@/lib/data/budgets";
import { getHouseholdOverview, listHouseholds, type HouseholdOverview } from "@/lib/data/household";

export const metadata: Metadata = { title: "Hogar" };

export default function HouseholdPage() {
  return (
    <main className={pageClass}>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Hogar</h1>
        <Link href="/" className={linkButtonClass}>← Presupuestos</Link>
      </header>
      <Suspense fallback={<p className="text-neutral-500">Cargando tu hogar…</p>}>
        <Households />
      </Suspense>
    </main>
  );
}

async function Households() {
  const households = await listHouseholds();

  if (households.length === 0) {
    return (
      <section className={cardClass}>
        <h2 className="mb-1 font-medium">Crea tu hogar</h2>
        <p className={`${mutedTextClass} mb-3`}>
          El hogar agrupa los presupuestos que compartes. Después podrás invitar a tu pareja con su correo.
        </p>
        <ActionForm action={createHousehold} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} min-w-48 flex-1`}>
              Nombre del hogar
              <input name="name" required defaultValue="Hogar" className={inputClass} />
            </label>
            <SubmitButton pendingLabel="Creando…">Crear hogar</SubmitButton>
          </div>
        </ActionForm>
      </section>
    );
  }

  const [overviews, budgets] = await Promise.all([
    Promise.all(households.map((household) => getHouseholdOverview(household))),
    listBudgets(),
  ]);
  const isYnabConfigured = Boolean(process.env.YNAB_ACCESS_TOKEN);

  return overviews.map((overview) => (
    <HouseholdCard
      key={overview.household.id}
      overview={overview}
      budgets={budgets.filter((budget) => budget.household_id === overview.household.id)}
      isYnabConfigured={isYnabConfigured}
    />
  ));
}

function HouseholdCard({
  overview,
  budgets,
  isYnabConfigured,
}: {
  overview: HouseholdOverview;
  budgets: BudgetSummary[];
  isYnabConfigured: boolean;
}) {
  const { household, people, invites } = overview;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-medium">{household.name}</h2>

      <section className={`${cardClass} flex flex-col gap-3`}>
        <h3 className="text-sm font-medium">Personas</h3>
        <ul className="flex flex-col gap-1 text-sm">
          {people.map((person) => (
            <li key={person.user_id} className="flex items-center justify-between gap-3">
              <span>{person.email}</span>
              <span className="text-xs text-neutral-500">{person.role === "owner" ? "Creó el hogar" : "Integrante"}</span>
            </li>
          ))}
          {invites.map((invite) => (
            <li key={invite.email} className="flex items-center justify-between gap-3">
              <span>
                {invite.email} <span className="text-xs text-neutral-500">· invitación pendiente</span>
              </span>
              <form action={revokeInvite}>
                <input type="hidden" name="householdId" value={household.id} />
                <input type="hidden" name="email" value={invite.email} />
                <SubmitButton className={linkButtonClass}>Quitar</SubmitButton>
              </form>
            </li>
          ))}
        </ul>
        <ActionForm action={inviteMember} className="flex flex-col gap-2">
          <input type="hidden" name="householdId" value={household.id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} min-w-48 flex-1`}>
              Invitar por correo
              <input type="email" name="email" required autoComplete="off" className={inputClass} />
            </label>
            <SubmitButton className={secondaryButtonClass} pendingLabel="Invitando…">Invitar</SubmitButton>
          </div>
          <p className="text-xs text-neutral-500">
            La persona entra con ese correo desde la pantalla de inicio de sesión y queda dentro del hogar.
          </p>
        </ActionForm>
      </section>

      <section className={`${cardClass} flex flex-col gap-3`}>
        <h3 className="text-sm font-medium">Presupuestos</h3>
        {budgets.length === 0 ? (
          <p className={mutedTextClass}>Todavía no hay presupuestos en este hogar.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {budgets.map((budget) => (
              <li key={budget.id}>
                <Link href={`/budgets/${budget.id}`} className="underline underline-offset-4">{budget.name}</Link>
                <span className="ml-2 text-xs text-neutral-500">{budget.currency_iso_code}</span>
              </li>
            ))}
          </ul>
        )}
        <ActionForm action={createBudget} className="flex flex-col gap-2">
          <input type="hidden" name="householdId" value={household.id} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${labelClass} min-w-48 flex-1`}>
              Nuevo presupuesto en blanco
              <input name="name" required placeholder="Presupuesto de casa" className={inputClass} />
            </label>
            <label className={labelClass}>
              Moneda
              <input name="currency" defaultValue="MXN" maxLength={3} className={`${inputClass} w-20 uppercase`} />
            </label>
            <SubmitButton className={secondaryButtonClass} pendingLabel="Creando…">Crear</SubmitButton>
          </div>
        </ActionForm>
      </section>

      <section className={`${cardClass} flex flex-col gap-3`}>
        <h3 className="text-sm font-medium">Traer datos de YNAB</h3>
        <p className={mutedTextClass}>
          La primera vez importa tu plan completo; después solo trae lo que cambió en YNAB. Lo que captures aquí no se
          envía a YNAB, y si editas lo mismo en ambos lados gana la versión de YNAB.
        </p>
        {isYnabConfigured ? (
          <ActionForm action={syncFromYnab} className="flex flex-col gap-2">
            <input type="hidden" name="householdId" value={household.id} />
            <div>
              <SubmitButton pendingLabel="Sincronizando… puede tardar un minuto">Traer cambios de YNAB</SubmitButton>
            </div>
          </ActionForm>
        ) : (
          <p className={mutedTextClass}>
            Para activarlo, genera un token en YNAB (Account Settings → Developer Settings), ponlo en{" "}
            <code className="font-mono">YNAB_ACCESS_TOKEN</code> dentro de <code className="font-mono">.env.local</code> y
            reinicia la app.
          </p>
        )}
      </section>
    </div>
  );
}
