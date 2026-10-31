import { Logo } from "@/components/Logo";
import { KeyboardWatch } from "./KeyboardWatch";
import { QUESTIONS } from "@/lib/signup-flow";

/** Line icons for the sign-in and sign-up screens (18px, stroke = currentColor). */
const PATHS = {
  back: <path d="M15 6l-6 6 6 6" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  ok: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-4.8" /></>,
  no: <><circle cx="12" cy="12" r="8.5" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  cam: <><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" /></>,
  img: <><rect x="4" y="4.5" width="16" height="15" rx="3" /><circle cx="9" cy="10" r="1.6" /><path d="M5 17l4.5-4.5 3 3 2.5-2.5L20 17.5" /></>,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" /></>,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4l16 16" /><path d="M10.6 6.1A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-2.8 3.4M6.4 7.6A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4-.9" /><path d="M9.9 10a3 3 0 0 0 4.2 4.1" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  head: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14" width="4" height="6" rx="1.5" /><rect x="16.5" y="14" width="4" height="6" rx="1.5" /></>,
  wave: <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10" />,
  mic: <><rect x="9" y="3.5" width="6" height="11" rx="3" /><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" /></>,
  disc: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="2" /></>,
  radio: <><rect x="3.5" y="8" width="17" height="11.5" rx="2.5" /><path d="M7 8l9-4.5" /><circle cx="15.5" cy="13.75" r="2.5" /></>,
  star: <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" />,
  case: <><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" /><path d="M9 7.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v1.5M3.5 12.5h17" /></>,
} as const;
export type AuthIconName = keyof typeof PATHS;

export function AuthIcon({ name, className = "" }: { name: AuthIconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={name === "check" ? 2.4 : 1.7} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[name]}
    </svg>
  );
}

/** Step 1 and the recovery screens: the crest and the home page's line, over the scene. */
export function CrestMoment({ line = "One link for every track you're sent." }: { line?: string }) {
  return (
    <div className="af-m1">
      {/* eslint-disable-next-line @next/next/no-img-element -- an SVG; the image optimizer doesn't process SVGs */}
      <img src="/brand/crest.svg" alt="" />
      <p>{line}</p>
    </div>
  );
}

/**
 * The shell every sign-in, sign-up and recovery screen sits in (auth.css has the layout rules). `step` (1 to 7) shows
 * the progress line and count; `back` is the Back control; `aside` is what shows through the desktop frame's open
 * side. `form` turns the column into the form, so the action below the content is part of it.
 */
export function AuthFrame({
  children,
  footer,
  step = 0,
  back,
  aside,
  center = false,
  stepKey,
  form,
  photo = false,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  step?: number;
  back?: React.ReactNode;
  aside?: React.ReactNode;
  center?: boolean;
  /** Changes when the step changes, so the content settles in again. */
  stepKey?: string | number;
  form?: React.FormHTMLAttributes<HTMLFormElement>;
  /** Phones: the club photo, toned down, behind this screen (the first and last of sign-up). */
  photo?: boolean;
}) {
  const inner = (
    <>
      <header className="af-hd">
        <div className="af-bar">
          <span className="af-backslot">{back}</span>
          <Logo className="af-logo" />
          <span className="af-count" aria-hidden>
            {step ? `${step}/${QUESTIONS}` : ""}
          </span>
          <div className={`af-prog${step ? "" : " none"}`} {...(step ? { role: "img", "aria-label": `Step ${step} of ${QUESTIONS}` } : { "aria-hidden": true })}>
            {Array.from({ length: QUESTIONS }, (_, i) => (
              <i key={i} className={i + 1 < step ? "done" : i + 1 === step ? "on" : ""} />
            ))}
          </div>
        </div>
      </header>
      <section className="af-mid">
        <div className="af-sp-t" />
        <div key={stepKey} className={`af-blk${center ? " af-center" : ""}`}>
          {children}
        </div>
        {footer && (
          <>
            <div className="af-sp-m" />
            <div className="af-ft">{footer}</div>
          </>
        )}
        <div className="af-sp-b" />
        <div className="af-end" />
      </section>
    </>
  );
  return (
    <div className="af-frame">
      <KeyboardWatch />
      {photo && <div className="af-photo" aria-hidden />}
      <div className="af-panel">{form ? <form className="af-flow" {...form}>{inner}</form> : <div className="af-flow">{inner}</div>}</div>
      <div className="af-view">{aside ?? <CrestMoment />}</div>
    </div>
  );
}

/** The receiver's link card, filling in as the steps go: grey slots until each part is known. */
export function LinkCard({
  label,
  name,
  role,
  handle,
  host,
  photo,
  initials,
  note,
}: {
  label: string;
  name?: string;
  role?: string;
  handle?: string;
  host: string;
  photo?: string | null;
  initials?: string;
  note?: string;
}) {
  return (
    <figure className="af-lc-wrap" aria-label="Preview of your link">
      <figcaption className="af-lc-lab">{label}</figcaption>
      <div className="af-lc">
        <div className="af-lc-top">
          <span className={`af-lc-ph${photo ? " af-has" : ""}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) or the cover route */}
            {photo ? <img src={photo} alt="" /> : initials}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            {name ? <div className="af-lc-name">{name}</div> : <span className="af-slot" style={{ width: "70%" }} />}
            {role ? <div className="af-lc-role">{role}</div> : <span className="af-slot" style={{ width: "30%", marginTop: 10 }} />}
          </div>
        </div>
        <div className="af-lc-link">
          {handle ? (
            <>
              {host}/<b>{handle}</b>
            </>
          ) : (
            <span className="af-slot" style={{ width: "80%", margin: "2px 0" }} />
          )}
        </div>
      </div>
      {note && <p className="af-lc-note">{note}</p>}
    </figure>
  );
}
