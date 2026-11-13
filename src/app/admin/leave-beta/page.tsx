import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { SWITCHES, switchState, type SwitchKey } from "@/lib/switches";
import { LAUNCH_CHECKS, launchChecks, SWITCH_BLOCKERS, type CheckState, type LaunchCheck } from "@/lib/launch-checks";
import { flipSwitch, markLaunchCheck } from "../actions";
import { ConfirmButton } from "../AdminUi";
import { PageHead } from "../PinParts";

/** Where "beta" shows to receivers and senders today. Ops tags stay; legal pages are the lawyer's and only listed. */
const BETA_PLACES: { where: string; legal?: true }[] = [
  { where: "Logo badge (every page)" },
  { where: "Home: hero line and footer note (Site content)" },
  { where: "Pricing and Plans: intro, plan cards, “after the beta” prices" },
  { where: "Plans: confirmation, free-trial notes, plan requests" },
  { where: "Checkout: beta discount and trial wording" },
  { where: "Account: “Free in the beta” plan chip" },
  { where: "Collections: two collections per desk note" },
  { where: "Sign-up: invite-only messages (form and Google)" },
  { where: "Emails: beta invite subject and body" },
  { where: "Share card: BETA pill" },
  { where: "Terms: beta invites, billing and as-is sections", legal: true },
  { where: "Legal pages: “Draft for the private beta” note", legal: true },
];

const day = (at: number) => new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Ops → Leave beta: one row per part of leaving the beta, with its state, what it waits on and a way to its switch.
 * Flips go through the same flipSwitch as Feature switches (super admin, two-step ops session, logged); a switch whose
 * checklist isn't done can't be turned on here or there. No master button: each part is its own decision.
 */
export default async function LeaveBeta() {
  await requireAdmin("super");
  // Site lock (Backend, `site_lock`) shows its switch here once it is in SWITCHES; until then "Not built yet".
  const lockKey = "site_lock" in SWITCHES ? ("site_lock" as SwitchKey) : null;
  const [checks, signup, billing, started, lock] = await Promise.all([
    launchChecks(),
    switchState("open_signup"),
    switchState("billing"),
    switchState("beta_started"),
    lockKey ? switchState(lockKey) : null,
  ]);
  const billingOpen = (SWITCH_BLOCKERS.billing ?? []).filter((c) => !checks[c].done);

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Ops" title="Leave beta">
        Each part of leaving the beta, what it waits on, and its switch. Every change asks first, takes effect straight away and goes in the admin log.
      </PageHead>
      <ul className="divide-y divide-line rounded-md border border-line">
        {lockKey && lock ? (
          <Row title={SWITCHES[lockKey].label} state={<State text={lock.on ? "On" : "Off"} on={lock.on} />} toggle={<Toggle k={lockKey} on={lock.on} />}>
            <p className="text-sm text-mute">{SWITCHES[lockKey].description}</p>
            <SwitchLink k={lockKey} />
          </Row>
        ) : (
          <Row title="Site lock" state={<State text="Not built yet" />}>
            <p className="text-sm text-mute">Backend is building it. It shows here once it exists.</p>
          </Row>
        )}

        <Row title={SWITCHES.open_signup.label} state={<State text={signup.on ? "On" : "Off"} on={signup.on} />} toggle={<Toggle k="open_signup" on={signup.on} />}>
          <p className="text-sm text-mute">{SWITCHES.open_signup.description}</p>
          <SwitchLink k="open_signup" />
        </Row>

        <Row
          title={SWITCHES.billing.label}
          state={<State text={billing.on ? "On" : billingOpen.length ? "Off, blocked" : "Off, ready"} on={billing.on} />}
          toggle={billing.on || !billingOpen.length ? <Toggle k="billing" on={billing.on} /> : null}
        >
          <p className="text-sm text-mute">{SWITCHES.billing.description}</p>
          <p className="label mt-1">Waits on (you mark these)</p>
          <ul className="space-y-2">
            {(SWITCH_BLOCKERS.billing ?? []).map((c) => (
              <CheckRow key={c} check={c} state={checks[c]} />
            ))}
          </ul>
          <SwitchLink k="billing" />
        </Row>

        <Row title={SWITCHES.beta_started.label} state={<State text={started.on ? "On" : "Off"} on={started.on} />} toggle={<Toggle k="beta_started" on={started.on} />}>
          <p className="text-sm text-mute">Changes the Growth numbers only. Nothing changes for receivers or senders.</p>
          <SwitchLink k="beta_started" />
        </Row>

        <Row title={"“Beta” wording"} state={<State text={`${BETA_PLACES.length} places`} />}>
          <p className="text-sm text-mute">Where receivers and senders still read &ldquo;beta&rdquo;. Ops tags stay as they are. Legal pages are shown only: the lawyer changes them.</p>
          <ul className="grid gap-1.5 text-sm sm:grid-cols-2">
            {BETA_PLACES.map((p) => (
              <li key={p.where} className="flex items-start gap-2">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-faint" />
                <span>
                  {p.where}
                  {p.legal && <span className="ml-1.5 text-[12px] text-faint">(legal, lawyer&apos;s)</span>}
                </span>
              </li>
            ))}
          </ul>
        </Row>
      </ul>
    </div>
  );
}

function Row({ title, state, toggle, children }: { title: string; state: React.ReactNode; toggle?: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="space-y-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">{title}</h2>
        <div className="flex items-center gap-3">
          {state}
          {toggle}
        </div>
      </div>
      {children}
    </li>
  );
}

const State = ({ text, on = false }: { text: string; on?: boolean }) => <span className={`text-[13px] font-semibold ${on ? "text-lime" : "text-faint"}`}>{text}</span>;

const SwitchLink = ({ k }: { k: SwitchKey }) => (
  <Link href={`/admin/switches#switch-${k}`} className="inline-flex min-h-11 items-center text-[13px] text-mute underline underline-offset-2">
    Open in Feature switches
  </Link>
);

/** The same toggle and the same action as Feature switches. */
function Toggle({ k, on }: { k: SwitchKey; on: boolean }) {
  return (
    <ConfirmButton
      action={flipSwitch.bind(null, k, !on)}
      message={`Turn ${on ? "off" : "on"} "${SWITCHES[k].label}"? It takes effect straight away for everyone.`}
      confirmLabel={on ? "Turn off" : "Turn on"}
      className={`admin-press relative h-11 w-[76px] shrink-0 rounded-full p-1 transition-colors duration-300 ${on ? "bg-lime" : "bg-ink-4 ring-1 ring-line-2"}`}
    >
      <span className="sr-only">{`${on ? "Turn off" : "Turn on"} ${SWITCHES[k].label}`}</span>
      <span
        aria-hidden
        className={`block size-9 rounded-full shadow-[0_2px_6px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${on ? "translate-x-8 bg-ink" : "translate-x-0 bg-bone"}`}
      />
    </ConfirmButton>
  );
}

function CheckRow({ check, state }: { check: LaunchCheck; state: CheckState }) {
  const { label, hint } = LAUNCH_CHECKS[check];
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line p-3">
      <div className="min-w-0 max-w-xl">
        <p className="text-sm font-semibold">
          <span className={state.done ? "text-lime" : "text-faint"}>{state.done ? "Done" : "Not done"}</span>
          <span className="text-mute"> · </span>
          {label}
        </p>
        <p className="mt-0.5 text-[13px] text-mute">{hint}</p>
        {state.at !== null && (
          <p className="mt-0.5 text-[12px] text-faint">
            Marked {state.done ? "done" : "not done"}
            {state.by ? ` by @${state.by}` : ""} on {day(state.at)}
          </p>
        )}
      </div>
      <ConfirmButton
        action={markLaunchCheck.bind(null, check, !state.done)}
        message={state.done ? `Mark "${label}" as not done? Paid plans can't be turned on again until it's done.` : `Mark "${label}" as done? Only mark it once it's true.`}
        confirmLabel={state.done ? "Mark not done" : "Mark done"}
        className="admin-press inline-flex min-h-11 items-center rounded-[10px] px-3.5 text-[13px] font-semibold ring-1 ring-line-2"
      >
        {state.done ? "Mark not done" : "Mark done"}
      </ConfirmButton>
    </li>
  );
}
