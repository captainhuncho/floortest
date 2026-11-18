import { AuthIcon } from "./AuthFrame";

/** The bars of one example waveform (heights in %), the same shape wherever it shows. */
const WAVE = [34, 58, 46, 72, 90, 64, 80, 52, 96, 70, 44, 62, 84, 56, 38, 66, 78, 48, 60, 40, 54, 30];

function Wave({ draw = false }: { draw?: boolean }) {
  return (
    <div className={`sc-wave${draw ? " sc-draw" : ""}`} aria-hidden>
      {WAVE.map((h, i) => (
        <i key={i} style={{ height: `${h}%`, "--i": i } as React.CSSProperties} />
      ))}
      <span className="sc-head" />
    </div>
  );
}

const Disc = () => <AuthIcon name="disc" className="sc-ic" />;

/** The receiver's example link: who it belongs to and where it lives. */
function ExampleLink({ host }: { host: string }) {
  return (
    <div className="sc-link ag-card">
      <span className="sc-av">MA</span>
      <span className="sc-lm">
        <span className="sc-url">
          {host}/<b>max</b>
        </span>
        <span className="sc-sm">DJ</span>
      </span>
    </div>
  );
}

/**
 * The example beside each chapter of the welcome story. Every scene is an illustration of the words next to it, so
 * all of it is hidden from screen readers except chapter 4's two real buttons (`keep` and `onKeep`).
 */
export function StoryScene({ chapter, host, keep, onKeep }: { chapter: number; host: string; keep: boolean | null; onKeep: (v: boolean) => void }) {
  if (chapter === 0)
    return (
      <div className="sc" aria-hidden>
        <div className="sc-drop">
          {["Second Light", "Harmattan", "Night Bus"].map((t, i) => (
            <span key={t} className={`sc-chip sc-t${i + 1}`}>
              <Disc />
              {t}
            </span>
          ))}
        </div>
        <ExampleLink host={host} />
      </div>
    );
  if (chapter === 1)
    return (
      <div className="sc" aria-hidden>
        <span className="sc-chip sc-in">
          <Disc />
          Second Light
        </span>
        <div className="sc-cols">
          {[
            ["Friday set", "Callout · Afro house, 120–124 BPM", "12"],
            ["Label demos", "Callout · open to all", "4"],
            ["Radio show", "Callout · closes Sunday", "7"],
          ].map(([name, sub, count], i) => (
            <div key={name} className={`sc-col ag-card${i === 0 ? " sc-on" : ""}`}>
              <AuthIcon name="sleeve" className="sc-ic" />
              <span className="sc-lm">
                <b>{name}</b>
                <span className="sc-sm">{sub}</span>
              </span>
              <span className="sc-cnt">{count}</span>
            </div>
          ))}
        </div>
      </div>
    );
  if (chapter === 2)
    return (
      <div className="sc" aria-hidden>
        <div className="sc-card ag-card">
          <p className="sc-sm">Kofi Mensah · no account</p>
          <div className="sc-file">
            <Disc />
            <b>Second Light.wav</b>
          </div>
          <Wave draw />
          <p className="sc-rc sc-late">
            <i />
            Delivered · receipt on its way
          </p>
        </div>
      </div>
    );
  if (chapter === 3)
    return (
      <div className="sc">
        <div className="sc-card ag-card">
          <div className="sc-file" aria-hidden>
            <Disc />
            <span className="sc-lm">
              <b>Second Light</b>
              <span className="sc-sm">Kofi Mensah · 124 BPM</span>
            </span>
          </div>
          <Wave />
          <div className="sc-keep" role="group" aria-label="Example: your decision on this track">
            <button type="button" className={`sc-k${keep === true ? " sc-on" : ""}`} aria-pressed={keep === true} onClick={() => onKeep(true)}>
              Keep
            </button>
            <button type="button" className={`sc-k${keep === false ? " sc-on" : ""}`} aria-pressed={keep === false} onClick={() => onKeep(false)}>
              Not for me
            </button>
          </div>
        </div>
      </div>
    );
  if (chapter === 4)
    return (
      <div className="sc" aria-hidden>
        <div className="sc-card ag-card">
          <p className="sc-sm">Kofi&apos;s receipt · Second Light</p>
          <ol className="sc-steps">
            <li className="sc-done">
              <span>Delivered</span>
              <em>Mon 16 Nov</em>
            </li>
            <li className="sc-done sc-live">
              <span>Listened</span>
              <em>just now</em>
            </li>
            <li>
              <span>Downloaded</span>
            </li>
            <li>
              <span>Played out</span>
            </li>
          </ol>
        </div>
      </div>
    );
  if (chapter === 5)
    return (
      <div className="sc" aria-hidden>
        <div className="sc-card ag-card">
          <p className="sc-sm">Prepare · 8 kept for Friday</p>
          {[
            ["Second Light", "124 BPM"],
            ["Harmattan", "122 BPM"],
            ["Night Bus (VIP)", "126 BPM"],
          ].map(([t, bpm]) => (
            <div key={t} className="sc-pr">
              <b>{t}</b>
              <span className="sc-sm">{bpm}</span>
            </div>
          ))}
          <div className="sc-dl">
            <span className="sc-dlb">Download kept</span>
            <span className="sc-bar">
              <i />
            </span>
          </div>
          <p className="sc-rc sc-late">
            <i />
            Friday set folder · playlist · Rekordbox XML
          </p>
        </div>
      </div>
    );
  return (
    <div className="sc" aria-hidden>
      <div className="sc-card ag-card">
        <p className="sc-sm">
          Send to {host}/<b>lunarrecords</b>
        </p>
        <div className="sc-file">
          <Disc />
          <span className="sc-lm">
            <b>Harmattan.wav</b>
            <span className="sc-sm">Your track</span>
          </span>
        </div>
        <ol className="sc-steps">
          <li className="sc-done">
            <span>Delivered</span>
            <em>Tue</em>
          </li>
          <li className="sc-done sc-live">
            <span>Listened</span>
            <em>today</em>
          </li>
          <li>
            <span>Downloaded</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
