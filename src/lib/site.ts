/** Product-level links and version. External links only appear once configured. */
export const VERSION = "0.4";

const env = (k: string) => (process.env[k] || "").trim() || null;

export const supportEmail = () => env("SUPPORT_EMAIL");

export type FooterLink = { label: string; href: string; external: boolean };

/** Footer links in groups, so a long list reads cleanly on phones. Empty groups (unset external links) are left out. */
export function footerGroups(): { title: string; links: FooterLink[] }[] {
  const ext = (label: string, href: string | null) => (href ? [{ label, href, external: true }] : []);
  const page = (label: string, href: string) => ({ label, href, external: false });
  return [
    { title: "For senders", links: [page("Track what you've sent", "/sent"), page("Content rules", "/content-rules")] },
    { title: "Help", links: [page("Pricing", "/pricing"), page("Contact us", "/contact"), page("Trust & Security", "/trust"), page("Report a security issue", "/security")] },
    {
      title: "Legal",
      links: [
        // Hosted legal documents replace the built-in drafts once their URLs are set.
        { label: "Terms of Use", href: env("TERMS_URL") ?? "/terms", external: !!env("TERMS_URL") },
        { label: "Privacy Policy", href: env("PRIVACY_URL") ?? "/privacy", external: !!env("PRIVACY_URL") },
        page("Cookie Policy", "/cookies"),
        page("Cookie settings", "#cookie-settings"),
        page("Your Privacy Choices", "/privacy-choices"),
        page("Notice and Takedown", "/takedown"),
        page("Sub-processors", "/subprocessors"),
        page("Law Enforcement", "/law-enforcement"),
        page("Third-party licenses", "/licenses"),
      ],
    },
    { title: "Follow", links: [...ext("Shop", env("SHOP_URL")), ...ext("Instagram", env("INSTAGRAM_URL"))] },
  ].filter((g) => g.links.length);
}
