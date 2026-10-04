/** Product-level links and version. External links only appear once configured. */
export const VERSION = "0.4";

const env = (k: string) => (process.env[k] || "").trim() || null;

export const supportEmail = () => env("SUPPORT_EMAIL");

export function footerLinks() {
  const ext = (label: string, href: string | null) => (href ? [{ label, href, external: true }] : []);
  return [
    ...ext("Shop", env("SHOP_URL")),
    ...ext("FloorTest on Instagram", env("INSTAGRAM_URL")),
    { label: "Track what you've sent", href: "/sent", external: false },
    { label: "Contact us", href: "/contact", external: false },
    { label: "Trust & Security", href: "/trust", external: false },
    // Hosted legal documents replace the built-in drafts once their URLs are set.
    { label: "Terms of Use", href: env("TERMS_URL") ?? "/terms", external: !!env("TERMS_URL") },
    { label: "Privacy Policy", href: env("PRIVACY_URL") ?? "/privacy", external: !!env("PRIVACY_URL") },
    { label: "Cookie Policy", href: "/cookies", external: false },
    { label: "Your Privacy Choices", href: "/privacy-choices", external: false },
    { label: "Notice and Takedown", href: "/takedown", external: false },
    { label: "Content Rules", href: "/content-rules", external: false },
    { label: "Sub-processors", href: "/subprocessors", external: false },
    { label: "Responsible Disclosure", href: "/security", external: false },
    { label: "Law Enforcement", href: "/law-enforcement", external: false },
    { label: "Third-party licenses", href: "/licenses", external: false },
  ];
}
