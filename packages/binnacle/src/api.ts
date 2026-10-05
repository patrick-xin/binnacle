// A module augmentation merges into Cordis's Context only in a file that imports Cordis.
// oxlint-disable-next-line no-unassigned-import
import '@deepseek-ai/cordis'

export interface Screen {
  /** Unwrapped, and untrusted: the core takes out control sequences before it draws. */
  lines(): readonly string[]
}

export interface Shown {
  redraw(): void
  /** The core also disposes it when the plugin that showed it unloads. */
  dispose(): void
}

export interface Binnacle {
  /** The id that `--session` names. */
  readonly session: string | undefined
  /** Only the newest screen shown is drawn. */
  show(screen: Screen): Shown
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    binnacle: Binnacle
  }
}
