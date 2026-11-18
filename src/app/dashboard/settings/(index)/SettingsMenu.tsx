"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Dialog, DIALOG_MAIN, DIALOG_QUIET } from "@/components/Dialog";
import { useActionForm } from "@/components/useActionForm";
import { DELETE_PHRASE, deletePhraseOk } from "@/lib/delete-phrase";
import { logout } from "../../../(auth)/actions";
import { signOutAllMyDevices } from "../../actions/security";
import { deleteAccount } from "../../actions/settings";
import { FIELD, HELP, Notice } from "../ui";
import { Glyph } from "./rows";

type Layer = null | "menu" | "signout" | "everywhere" | "delete" | "sure";

/** A sheet's buttons: one column, each the full width and 48px tall. */
const WIDE = "w-full min-h-12!";
const QUIET_LINK = "flex min-h-11 w-full items-center justify-center rounded-control text-[14px] text-mute underline underline-offset-[3px] hover:text-bone disabled:opacity-50";
const RED_BTN = `${DIALOG_QUIET} ${WIDE} text-danger!`;

/** "phone" on a phone-sized screen, "computer" from 640px, where sheets become centred panels. */
function Device() {
  return (
    <>
      <span className="sm:hidden">phone</span>
      <span className="hidden sm:inline">computer</span>
    </>
  );
}

/**
 * Sign out, and Delete account on your own desk. As "menu" it is the ••• at the top right of Settings; as "buttons" it
 * is the same two actions as plain buttons at the bottom of the page, so nobody has to hunt for them. Each opens its
 * own sheet (a centred panel on laptops). Signing out everywhere asks for the password; deleting asks for DELETE FLOORTEST
 * typed out. Both also ask for the two-step code when it's on, and the server checks them before anything changes.
 */
export function SettingsMenu({ everywhere, canDelete, twoFactor, variant = "menu" }: { everywhere: boolean; canDelete: boolean; twoFactor: boolean; variant?: "menu" | "buttons" }) {
  const [layer, setLayer] = useState<Layer>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuOpen = layer === "menu";
  const close = () => setLayer(null);

  // The menu closes on a press outside it; opening it puts focus on its first item.
  useEffect(() => {
    if (!menuOpen) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setLayer(null);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      setLayer(null);
      if (e.key === "Escape") trigger.current?.focus();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  const item = "flex min-h-12 w-full items-center gap-2.5 rounded-[10px] px-3 text-left text-[15px] hover:bg-well focus-visible:bg-well focus-visible:outline-none";

  const bottom = "flex min-h-12 w-full items-center justify-center gap-2.5 rounded-2xl border border-line bg-card px-4 text-[15px] font-medium hover:bg-well";

  return (
    <div ref={root} className={variant === "buttons" ? "flex flex-col gap-2" : "relative"}>
      {variant === "buttons" ? (
        <>
          <button type="button" className={`${bottom} text-bone`} onClick={() => setLayer("signout")}>
            <Glyph name="out" className="size-5" />
            Sign out
          </button>
          {canDelete && (
            <button type="button" className={`${bottom} text-danger`} onClick={() => setLayer("delete")}>
              Delete account
            </button>
          )}
        </>
      ) : (
        <button
        ref={trigger}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setLayer(menuOpen ? null : "menu")}
        className="grid size-11 place-items-center rounded-full bg-card text-bone hover:bg-well"
      >
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="currentColor">
          <circle cx="5" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="19" cy="12" r="1.8" />
        </svg>
        </button>
      )}
      {menuOpen && (
        <div role="menu" aria-label="More options" onKeyDown={onMenuKey} className="absolute right-0 top-[50px] z-30 flex w-60 flex-col rounded-2xl border border-line bg-card p-1.5 shadow-pop">
          <button type="button" role="menuitem" className={`${item} text-bone`} onClick={() => setLayer("signout")}>
            <Glyph name="out" className="size-5" />
            Sign out
          </button>
          {canDelete && (
            <button type="button" role="menuitem" className={`${item} text-danger`} onClick={() => setLayer("delete")}>
              <Glyph name="person" className="size-5" />
              Delete account
            </button>
          )}
        </div>
      )}

      <SignOut open={layer === "signout" || layer === "everywhere"} confirming={layer === "everywhere"} everywhere={everywhere} twoFactor={twoFactor} onEverywhere={() => setLayer("everywhere")} onClose={close} />

      {canDelete && (
        <>
          <Dialog
            open={layer === "delete"}
            onClose={close}
            title="Delete account?"
            description="Your desk, link and every track senders sent you are deleted for good. Senders get no more receipts. This can't be undone."
          >
            <div className="flex flex-col gap-2">
              <button type="button" className={RED_BTN} onClick={() => setLayer("sure")}>
                Delete account
              </button>
              <button type="button" data-autofocus="" className={QUIET_LINK} onClick={close}>
                Cancel
              </button>
            </div>
          </Dialog>
          <DeleteForGood open={layer === "sure"} twoFactor={twoFactor} onClose={close} />
        </>
      )}
    </div>
  );
}

/** "Sign out?": this device only, or every device. Everywhere asks for the password (and two-step code) first. */
function SignOut({ open, confirming, everywhere, twoFactor, onEverywhere, onClose }: { open: boolean; confirming: boolean; everywhere: boolean; twoFactor: boolean; onEverywhere: () => void; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setError(null);
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={done}
      busy={pending}
      title="Sign out?"
      description={
        everywhere ? (
          <>
            Sign out on this <Device /> only, or on every device where you are signed in.
          </>
        ) : (
          <>
            Sign out on this <Device />. To sign out everywhere, switch to your own desk first.
          </>
        )
      }
    >
      {confirming ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            start(async () => {
              // On success the action ends on the signed-out page; only a failed check comes back.
              const r = await signOutAllMyDevices(String(fd.get("password") || ""), String(fd.get("code") || ""));
              if (r?.error) setError(r.error);
            });
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Password</span>
            <input className="input text-[16px]! sm:text-[14px]!" type="password" name="password" required autoComplete="current-password" data-autofocus="" />
            <span className={HELP}>No password yet? Set one with &ldquo;Forgot your password?&rdquo; on the log-in page first.</span>
          </label>
          {twoFactor && (
            <label className="flex flex-col gap-1.5">
              <span className={FIELD}>Two-step code</span>
              <input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={40} placeholder="6-digit or recovery code" className="input text-[16px]! sm:text-[14px]!" />
            </label>
          )}
          {error && (
            <Notice tone="error" next={twoFactor ? "You're still signed in everywhere. Check your password and use a fresh code." : "You're still signed in everywhere. Check your password and try again."}>
              {error}
            </Notice>
          )}
          <div className="flex flex-col gap-2">
            <button className={`${DIALOG_MAIN} ${WIDE}`} disabled={pending}>
              {pending ? "Signing out…" : "Sign out everywhere"}
            </button>
            <button type="button" className={QUIET_LINK} disabled={pending} onClick={done}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-2">
          <form action={logout}>
            <button className={`${DIALOG_MAIN} ${WIDE}`}>
              {/* One span, so the flex button keeps the space before "phone" / "computer". */}
              <span>
                Sign out on this <Device />
              </span>
            </button>
          </form>
          {everywhere && (
            <button type="button" className={`${DIALOG_QUIET} ${WIDE}`} onClick={onEverywhere}>
              Sign out everywhere
            </button>
          )}
          <button type="button" className={QUIET_LINK} onClick={done}>
            Cancel
          </button>
        </div>
      )}
    </Dialog>
  );
}

/** Delete account, step 2: DELETE FLOORTEST typed exactly, and the two-step code when it's on, both checked on the server. No password (owner, 18 Nov). */
function DeleteForGood({ open, twoFactor, onClose }: { open: boolean; twoFactor: boolean; onClose: () => void }) {
  const [state, onSubmit, pending] = useActionForm(deleteAccount, undefined);
  const [typed, setTyped] = useState("");
  const done = () => {
    setTyped("");
    onClose();
  };
  return (
    <Dialog
      open={open}
      onClose={done}
      busy={pending}
      title="Are you sure?"
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={FIELD}>Type {DELETE_PHRASE} to confirm</span>
          {/* The phrase shows inside the box as a grey hint, never filled in for them (owner, 18 Nov). */}
          <input className="input text-[16px]! sm:text-[14px]!" name="confirm" placeholder={DELETE_PHRASE} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCorrect="off" autoCapitalize="characters" spellCheck={false} data-autofocus="" />
        </label>
        {twoFactor && (
          <label className="flex flex-col gap-1.5">
            <span className={FIELD}>Two-step code</span>
            <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit or recovery code" className="input text-[16px]! sm:text-[14px]!" />
          </label>
        )}
        {state?.error && (
          <Notice tone="error" next="Nothing has been deleted. Check the details above and try again.">
            {state.error}
          </Notice>
        )}
        <div className="flex flex-col gap-2">
          <button className={RED_BTN} disabled={pending || !deletePhraseOk(typed)}>
            {pending ? "Deleting…" : "Delete for good"}
          </button>
          <button type="button" className={QUIET_LINK} disabled={pending} onClick={done}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}
