/** True when a keyboard event comes from a text field, so global shortcuts must stay out of the way. */
export function isEditable(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable]')
}
