/**
 * What a plugin may depend on: the `binnacle` service and the types it takes.
 * @module binnacle/api
 */
// The augmentation below merges into Cordis's Context only where this file imports Cordis.
// oxlint-disable-next-line no-unassigned-import
import '@deepseek-ai/cordis'

/** What a plugin shows on the whole screen. */
export interface Screen {
  /**
   * Its lines, before wrapping. The core wraps each at the width, and draws
   * text from a model or a tool with its control sequences taken out.
   * @returns the lines, top first.
   */
  lines(): readonly string[]
}

/** A screen while it is shown. */
export interface Shown {
  /** Draw the screen again: its lines changed. */
  redraw(): void
  /** Stop showing it. The core does this too when the plugin that showed it unloads. */
  dispose(): void
}

/** The `binnacle` service. */
export interface Binnacle {
  /**
   * Show a screen. The newest screen shown is the one drawn.
   * @param screen - what to draw.
   * @returns the screen while shown.
   */
  show(screen: Screen): Shown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    binnacle: Binnacle
  }
}
