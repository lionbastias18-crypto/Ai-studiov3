export type TvDisplayMode = "auto" | "tv" | "standard";

export interface Ps4GamepadInfo {
  connected: boolean;
  isPlayStation: boolean;
  name: string;
  index: number;
}

export function isPs4OrTvBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /PlayStation\s*4|\bPS4\b|PlayStation|SmartTV|SMART-TV|Web0S|webOS|Tizen|BRAVIA|AFT[A-Z0-9]+|GoogleTV|Android TV|AppleTV|NetCast|Viera|Hisense|VIDAA/i.test(
    ua
  );
}

export function isDualShockController(pad: Gamepad | null | undefined): boolean {
  if (!pad || !pad.id) return false;
  return /dualshock|wireless controller|054c|09cc|05c4|0ce6|sony|ps4|ps5|playstation/i.test(
    pad.id
  );
}

export function findConnectedGamepad(): Ps4GamepadInfo {
  if (typeof navigator === "undefined" || typeof navigator.getGamepads !== "function") {
    return { connected: false, isPlayStation: false, name: "", index: -1 };
  }
  try {
    const pads = navigator.getGamepads();
    let fallback: Gamepad | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      if (isDualShockController(p)) {
        return {
          connected: true,
          isPlayStation: true,
          name: p.id || "DualShock 4",
          index: p.index,
        };
      }
      if (!fallback) fallback = p;
    }
    if (fallback) {
      return {
        connected: true,
        isPlayStation: false,
        name: fallback.id || "Gamepad",
        index: fallback.index,
      };
    }
  } catch {
    // Ignore restricted getGamepads calls
  }
  return { connected: false, isPlayStation: false, name: "", index: -1 };
}

export function applyTvSafeCssVars(
  overscanPercent: number,
  isTvActive: boolean,
  tvUiScale: number,
  gamepadActive: boolean
): void {
  if (typeof document === "undefined") return;
  const clampedOverscan = Math.max(85, Math.min(100, overscanPercent));
  const halfMarginPct = (100 - clampedOverscan) / 2;
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--tv-safe-x", `${halfMarginPct.toFixed(2)}vw`);
  rootStyle.setProperty("--tv-safe-y", `${halfMarginPct.toFixed(2)}vh`);
  rootStyle.setProperty("--tv-ui-scale", `${Math.max(0.85, Math.min(1.4, tvUiScale)).toFixed(3)}`);
  document.documentElement.setAttribute("data-tv-mode", isTvActive ? "true" : "false");
  document.documentElement.setAttribute("data-gamepad-active", gamepadActive ? "true" : "false");
}

function getTopmostInteractiveScope(): ParentNode {
  const allFixed = Array.from(document.querySelectorAll<HTMLElement>("div.fixed, section.fixed"));
  let bestEl: HTMLElement | null = null;
  let bestZ = -1;

  for (const el of allFixed) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.pointerEvents === "none") {
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width < 120 || rect.height < 120) continue;
    const hasInteractive = el.querySelector("button:not(:disabled), input:not(:disabled), select:not(:disabled)");
    if (!hasInteractive) continue;
    const z = parseInt(style.zIndex || "0", 10);
    const numericZ = Number.isNaN(z) ? 0 : z;
    if (numericZ >= bestZ) {
      bestZ = numericZ;
      bestEl = el;
    }
  }

  return bestEl || document;
}

export function getFocusableCandidates(): HTMLElement[] {
  const scope = getTopmostInteractiveScope();
  const raw = Array.from(
    scope.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), a[href]'
    )
  );
  return raw.filter((el) => {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity || "1") === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width >= 10 && rect.height >= 10;
  });
}

export function navigateFocusSpatial(direction: "up" | "down" | "left" | "right"): HTMLElement | null {
  const candidates = getFocusableCandidates();
  if (candidates.length === 0) return null;

  const active = document.activeElement as HTMLElement | null;
  if (!active || !candidates.includes(active)) {
    const first = candidates[0];
    first.focus({ preventScroll: false });
    first.scrollIntoView({ block: "nearest", inline: "nearest" });
    return first;
  }

  // If focused on a range slider, Left/Right adjusts the slider instead of jumping away
  if (
    active instanceof HTMLInputElement &&
    active.type === "range" &&
    (direction === "left" || direction === "right")
  ) {
    const min = parseFloat(active.min || "0");
    const max = parseFloat(active.max || "100");
    const step = parseFloat(active.step || "1") || 1;
    const current = parseFloat(active.value || "0");
    const next = Math.max(min, Math.min(max, current + (direction === "right" ? step : -step)));
    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(active, String(next));
      active.dispatchEvent(new Event("input", { bubbles: true }));
      active.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return active;
  }

  const aRect = active.getBoundingClientRect();
  const ax = aRect.left + aRect.width / 2;
  const ay = aRect.top + aRect.height / 2;

  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const el of candidates) {
    if (el === active) continue;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = cx - ax;
    const dy = cy - ay;

    let valid = false;
    let primary = 0;
    let secondary = 0;

    if (direction === "right" && dx > 6) {
      valid = true;
      primary = dx;
      secondary = Math.abs(dy);
    } else if (direction === "left" && dx < -6) {
      valid = true;
      primary = -dx;
      secondary = Math.abs(dy);
    } else if (direction === "down" && dy > 6) {
      valid = true;
      primary = dy;
      secondary = Math.abs(dx);
    } else if (direction === "up" && dy < -6) {
      valid = true;
      primary = -dy;
      secondary = Math.abs(dx);
    }

    if (!valid) continue;
    const score = primary + secondary * 2.2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }

  if (best) {
    best.focus({ preventScroll: false });
    best.scrollIntoView({ block: "nearest", inline: "nearest" });
    return best;
  }
  return active;
}

export function activateFocusedElement(): boolean {
  const candidates = getFocusableCandidates();
  const active = document.activeElement as HTMLElement | null;
  const target = active && candidates.includes(active) ? active : candidates[0];
  if (!target) return false;
  if (target instanceof HTMLInputElement && target.type === "range") {
    return false;
  }
  target.click();
  return true;
}
