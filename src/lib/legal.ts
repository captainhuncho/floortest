/** Who runs FloorTest, as named on the legal pages. Add the registration number and address once FloorTest Labs is registered in Ghana. */
/**
 * The version of the private-sharing wording (send form line + Terms) a sender agrees to when a collection allows
 * sharing. Stored on each track (tracks.share_terms); only tracks with a version can be shared through collection
 * links. "owner" marks the receiver's own uploads. Set this to the date of the lawyer-approved wording before
 * switching sharing on.
 */
export const SHARING_TERMS_VERSION = "2026-10-draft";

export const LEGAL = {
  operator: "FloorTest Labs, a company being registered in Ghana",
  /** Operator contact: the Terms, legal notices, authorities (DSA point of contact) and law enforcement. */
  email: "legal@floortest.app",
  /** Data protection: Privacy, Cookies, privacy choices, subprocessors. */
  privacy: "privacy@floortest.app",
  /** Copyright and takedown notices. */
  copyright: "copyright@floortest.app",
  /** Security vulnerability reports. */
  security: "security@floortest.app",
  updated: "7 October 2026",
};
