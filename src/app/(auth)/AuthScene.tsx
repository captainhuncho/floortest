/**
 * The scene behind the sign-in screens and the coming-soon gate (owner, 17 Nov, options 54 and 55): six decorative
 * layers (the photo, its tone at night or vignette by day, the beam, the haze and the two letterbox bars). auth.css
 * holds their looks; they move only when the device allows motion.
 */
export function AuthScene() {
  return (
    <div className="af-scene" aria-hidden>
      <span className="af-l af-l-photo" />
      <span className="af-l af-l-tone" />
      <span className="af-l af-l-beam" />
      <span className="af-l af-l-haze" />
      <span className="af-l af-l-box af-l-top" />
      <span className="af-l af-l-box af-l-bottom" />
    </div>
  );
}
