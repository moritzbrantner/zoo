export type HotkeyBinding = {
  key: string;
  run: () => void;
  enabled?: boolean | (() => boolean);
  repeat?: boolean;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

type HotkeyOptions = {
  allowInEditable?: boolean;
};

type ButtonLabelOptions = {
  labelClassName?: string;
  badgeClassName?: string;
};

export function installHotkeys(
  getBindings: () => HotkeyBinding[],
  options: HotkeyOptions = {},
) {
  document.addEventListener("keydown", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    const key = normalizeHotkey(event.key);
    if (!key) {
      return;
    }

    if (!options.allowInEditable && isEditableTarget(event.target)) {
      return;
    }

    const binding = getBindings().find((candidate) => {
      if (normalizeHotkey(candidate.key) !== key) return false;
      if (!modifierMatches(candidate.shiftKey, event.shiftKey, true)) return false;
      if (!modifierMatches(candidate.ctrlKey, event.ctrlKey)) return false;
      if (!modifierMatches(candidate.metaKey, event.metaKey)) return false;
      if (!modifierMatches(candidate.altKey, event.altKey)) return false;
      if (!(candidate.repeat ?? false) && event.repeat) return false;
      return bindingEnabled(candidate.enabled);
    });

    if (!binding) {
      return;
    }

    event.preventDefault();
    binding.run();
  }, { capture: true });
}

export function setButtonLabelWithHotkey(
  button: HTMLElement,
  label: string,
  key: string | null,
  options: ButtonLabelOptions = {},
) {
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  if (options.labelClassName) {
    labelEl.className = options.labelClassName;
  }

  if (!key) {
    button.replaceChildren(labelEl);
    button.removeAttribute("aria-keyshortcuts");
    return;
  }

  const badge = document.createElement("span");
  badge.className = options.badgeClassName ?? "hotkey-badge";
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = hotkeyLabel(key);

  button.replaceChildren(labelEl, badge);
  button.setAttribute("aria-keyshortcuts", ariaShortcut(key));
}

export function createHotkeyBadge(key: string, className = "hotkey-badge") {
  const badge = document.createElement("span");
  badge.className = className;
  badge.setAttribute("aria-hidden", "true");
  badge.textContent = hotkeyLabel(key);
  return badge;
}

export function hotkeyLabel(key: string) {
  const normalized = normalizeHotkey(key);
  if (!normalized) {
    return "";
  }

  if (normalized === "space") return "Space";
  if (normalized === "escape") return "Esc";
  if (normalized === "enter") return "Enter";
  if (normalized === "arrowup") return "Up";
  if (normalized === "arrowdown") return "Down";
  if (normalized === "arrowleft") return "Left";
  if (normalized === "arrowright") return "Right";
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

export function normalizeHotkey(key: string | null | undefined) {
  if (!key) {
    return null;
  }

  if (key === " ") {
    return "space";
  }

  return key.toLowerCase();
}

function ariaShortcut(key: string) {
  const normalized = normalizeHotkey(key);
  if (normalized === "space") return "Space";
  if (normalized === "escape") return "Escape";
  if (normalized === "enter") return "Enter";
  if (!normalized) return "";
  return normalized.length === 1 ? normalized.toUpperCase() : normalized;
}

function bindingEnabled(enabled: HotkeyBinding["enabled"]) {
  if (typeof enabled === "function") {
    return enabled();
  }

  return enabled ?? true;
}

function modifierMatches(
  expected: boolean | undefined,
  actual: boolean,
  allowUnexpected = false,
) {
  if (expected !== undefined) {
    return expected === actual;
  }

  return !actual || allowUnexpected;
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}
