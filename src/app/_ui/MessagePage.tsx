import { Logo } from "@/components/Logo";
import { Icon, type IconName } from "@/components/Kit";

/**
 * One-message pages (owner, 31 Oct): the email-link pages (share gate, team invite, confirm and verify email, newsletter,
 * unsubscribe, reopen alert) and the error and not-found screens. The same model as the sign-in shell: the logo on top,
 * then the message and its action as one group, centred about 43% down (spacers 3 : 4), with even air. On phones the
 * group sits on the page; from 640px it sits on the card. Light or dark with the visitor's device, safe areas, 100dvh.
 * Server-safe (no hooks), so client error boundaries can use it too. `_ui` is a private folder: no route.
 */

/** ok: it worked (lime tick). wait: one more step. off: the link or page didn't work. */
export type MessageTone = "ok" | "wait" | "off";

const MARK: Record<MessageTone, string> = { ok: "text-lime", wait: "text-bone", off: "text-mute" };

/** The main action: lime, full width on phones, its own width from 640px. Works on <a>, <Link> and <button>. */
export const PRIMARY = "btn-lime min-h-12 w-full whitespace-normal rounded-[13px] px-5 py-3 text-center text-[14px] sm:w-auto sm:min-w-[11rem]";
/** A second, quieter action beside the main one. */
export const SECONDARY =
  "inline-flex min-h-12 w-full items-center justify-center rounded-[13px] border border-line bg-well px-5 py-3 text-center text-[13.5px] font-semibold text-bone transition hover:bg-ink-4 sm:w-auto";

/** The message and its actions, centred. Used inside MessagePage, and on its own where the page frame already exists (the desk). */
export function MessageBlock({
  icon,
  tone = "wait",
  title,
  children,
  actions,
  align = "center",
  stack = false,
}: {
  icon: IconName;
  tone?: MessageTone;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  /** "start" for steps with form fields, so labels and inputs read left to right. */
  align?: "center" | "start";
  /** Two long actions: one above the other, full width, on every screen. */
  stack?: boolean;
}) {
  const centre = align === "center";
  const row = stack ? "sm:[&>*]:w-full!" : `sm:w-auto sm:flex-row ${centre ? "sm:justify-center" : ""}`;
  return (
    <div className={`flex w-full flex-col ${centre ? "items-center text-center" : "items-start text-left"}`}>
      <span aria-hidden className={`grid size-11 place-items-center rounded-[13px] border border-line bg-well ${MARK[tone]}`}>
        <Icon name={icon} className="size-5" />
      </span>
      <h1 className="mt-5 text-balance text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[28px]">{title}</h1>
      {children && <div className={`mt-2.5 flex w-full flex-col gap-2.5 text-pretty text-[14px] leading-[1.55] text-mute ${centre ? "items-center" : ""}`}>{children}</div>}
      {actions && <div className={`mt-7 flex w-full flex-col gap-2.5 ${row}`}>{actions}</div>}
    </div>
  );
}

/** The block inside a frame that already has its own logo and menu (the desk): centred about 43% down the space left. */
export function MessageInFrame(block: Parameters<typeof MessageBlock>[0] & { role?: "alert" }) {
  const { role, ...rest } = block;
  return (
    <div role={role} className="page-gutter flex min-h-[calc(100dvh-12rem)] flex-col py-6 md:min-h-[calc(100dvh-3.5rem)]">
      <div aria-hidden className="min-h-6 flex-[3_1_0]" />
      <div className="mx-auto w-full max-w-[440px]">
        <MessageBlock {...rest} />
      </div>
      <div aria-hidden className="min-h-6 flex-[4_1_0]" />
    </div>
  );
}

/**
 * The whole page: logo, the centred group, and an optional quiet footer line. `system` follows the visitor's device for
 * light or dark (public pages); turn it off where the surrounding page sets the theme (ops).
 */
export function MessagePage({
  foot,
  logo = true,
  system = true,
  wide = false,
  ...block
}: Parameters<typeof MessageBlock>[0] & { foot?: React.ReactNode; logo?: boolean; system?: boolean; wide?: boolean }) {
  return (
    <main
      className={`${system ? "theme-system bg-ink" : ""} flex min-h-dvh flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-8`}
    >
      <header className="flex h-11 shrink-0 items-center justify-center">{logo && <Logo />}</header>
      <div aria-hidden className="min-h-8 flex-[3_1_0] [@media(max-height:499px)]:flex-none" />
      <section
        className={`mx-auto w-full ${wide ? "max-w-[520px]" : "max-w-[440px]"} sm:rounded-[18px] sm:border sm:border-line sm:bg-card sm:px-9 sm:py-10 sm:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]`}
      >
        <MessageBlock {...block} />
      </section>
      <div aria-hidden className="min-h-8 flex-[4_1_0] [@media(max-height:499px)]:flex-none" />
      {foot && <footer className="mx-auto max-w-[440px] text-center text-[11.5px] leading-[1.5] text-dim">{foot}</footer>}
    </main>
  );
}
