/** How an email's delivery status moves as Resend's reports arrive (src/app/api/webhooks/resend/route.ts). */
export type Delivery = "delivered" | "delayed" | "bounced" | "soft_bounce" | "complained";

/** The status an email moves to, given what it showed before and the new report; null keeps what it had. */
export function nextDelivery(before: string, deliveredBefore: boolean, report: "delivered" | "delayed" | "bounced" | "complained", soft: boolean): Delivery | null {
  if (report === "delivered") return before === "complained" ? null : "delivered";
  if (report === "delayed") return before === "" || before === "delayed" ? "delayed" : null;
  if (report === "complained") return "complained";
  if (deliveredBefore || before === "complained") return null; // a later bounce is only a note
  return soft ? "soft_bounce" : "bounced";
}
