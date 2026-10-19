'use client';

import {useSyncExternalStore} from 'react';
import styles from './toast.module.css';

// One toast at a time for the whole site: the root layout mounts <Toaster />
// once, and any page calls showToast(). Calling it again while a toast is up
// replaces it instead of stacking and restarts the timer from that call.

export const LOGIN_REQUIRED_MESSAGE = '로그인 후 이용할 수 있어요.';

const VISIBLE_MS = 3000;
// The last part of VISIBLE_MS is spent fading out.
const FADE_MS = 200;

type ToastState = {message: string; leaving: boolean} | null;

let current: ToastState = null;
let fadeTimer: ReturnType<typeof setTimeout> | undefined;
let hideTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function update(next: ToastState) {
  current = next;
  listeners.forEach((listener) => listener());
}

export function showToast(message: string) {
  clearTimeout(fadeTimer);
  clearTimeout(hideTimer);
  update({message, leaving: false});
  fadeTimer = setTimeout(() => update(current && {...current, leaving: true}), VISIBLE_MS - FADE_MS);
  hideTimer = setTimeout(() => update(null), VISIBLE_MS);
}

export function showLoginRequiredToast() {
  showToast(LOGIN_REQUIRED_MESSAGE);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export default function Toaster() {
  const toast = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  // The live region stays mounted (empty when idle) so screen readers pick up
  // the message when it appears. It never takes pointer events or page space.
  return (
    <div className={styles.region} role="status" aria-live="polite" aria-atomic="true">
      {toast && (
        <p className={styles.toast} data-leaving={toast.leaving || undefined}>
          {toast.message}
        </p>
      )}
    </div>
  );
}
