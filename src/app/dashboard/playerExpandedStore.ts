/** Whether the expanded player is open. The bar, the phone's mini player and the dialog are separate pieces of the
 *  desk layout, so the one flag lives here and each of them reads or sets it. */
let open = false;
const listeners = new Set<() => void>();

export function setPlayerExpanded(next: boolean) {
  if (open === next) return;
  open = next;
  listeners.forEach((l) => l());
}
export const subscribePlayerExpanded = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
export const playerExpanded = () => open;
