/**
 * Channels of the new-capture popup. Kept in their own module on purpose: the two
 * preload scripts must not share any runtime module, or the bundler would split it
 * into a chunk that sandboxed preloads cannot require() (see scripts/check-preload.mjs).
 */
export const POPUP_IPC = {
  copy: 'popup:copy',
  copyImage: 'popup:copy-image',
  open: 'popup:open',
  dismiss: 'popup:dismiss',
  show: 'popup:show',
  copied: 'popup:copied',
  current: 'popup:current'
} as const
