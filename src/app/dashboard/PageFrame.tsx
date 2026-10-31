/**
 * The one content frame for every dashboard page. It lays nothing out itself: each page lays out against <main> (the
 * space beside the sidebar) with its own `page-gutter` (16px on phones, 32px from md up) and one centred column
 * (`mx-auto` plus the page's max width: 768px for reading pages such as Activity and Emails, 1024px for Contacts,
 * 1152px from xl for the wide desk pages such as the Floor, Send, Prepare and Collections; the Queue goes to 1360px).
 *
 * It used to be a left-aligned 1152px box, which pushed every page but the Floor, Queue and Account to the left on
 * wide screens (216px off centre at 1440px, ~700px at 1920px). Now every page is centred the same way (owner, 31 Oct).
 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="contents">{children}</div>;
}
