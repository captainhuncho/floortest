/**
 * The private link pages' test data (test runs only, SEED_LINK_PAGES=1): scripts/seed.ts stores these, and
 * e2e/link-pages.spec.ts opens each page with its link and checks the address it was sent to never shows in full.
 * The links are throwaway values that exist only in the test copy's database.
 */
export const LINKS = {
  desk: { email: "links@floortest.test", name: "Lina Links", handle: "linadesk" },
  sender: { email: "linkpriv.sender@example.com", masked: "l•••@e•••.com", title: "Private Pages Groove", artist: "Lux Private" },
  receiptToken: "e2eLinkPagesReceipt01",
  sentToken: "e2eLinkPagesSentLinkToken0000001",
  invitee: { email: "invitee.links@floortest.test", masked: "i•••@f•••.test" },
  inviteSecret: "e2eLinkPagesInviteSecret0000001",
  unverified: { email: "unverified.links@floortest.test", masked: "u•••@f•••.test" },
  verifyToken: "e2eLinkPagesVerifyEmailToken0001",
  changer: { email: "changer.links@floortest.test", masked: "c•••@f•••.test", next: "changed.links@floortest.test" },
  confirmToken: "e2eLinkPagesConfirmEmailToken001",
} as const;
