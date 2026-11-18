/**
 * Deleting an account asks the person to type this exactly (owner, 18 Nov: "accurately typing DELETE FLOORTEST so
 * people don't mistakenly delete account"). Capitals matter; only spaces around it are ignored. The form sends it and
 * deleteAccount checks it on the server too, so the check never rests on the button alone.
 */
export const DELETE_PHRASE = "DELETE FLOORTEST";

export function deletePhraseOk(typed: unknown): boolean {
  return typeof typed === "string" && typed.trim() === DELETE_PHRASE;
}
