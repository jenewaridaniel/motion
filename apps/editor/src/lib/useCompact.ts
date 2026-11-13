import { useSyncExternalStore } from "react";

/** Below this width the editor uses the compact (phone and tablet) layout. */
const QUERY = "(max-width: 1023px)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export const isCompact = () => window.matchMedia(QUERY).matches;

/** True on phones and narrow tablets. Updates on resize and rotation. */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompact, () => false);
}

const SHORT = "(max-height: 499px)";

function subscribeShort(cb: () => void) {
  const mq = window.matchMedia(SHORT);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/** True when the screen is short, e.g. a phone held sideways. */
export function useShort(): boolean {
  return useSyncExternalStore(
    subscribeShort,
    () => window.matchMedia(SHORT).matches,
    () => false,
  );
}
