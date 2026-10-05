// binnacle: only what the editor takes from pi-tui's tui.ts. The core owns the terminal, so `TUI` is the shim the composer gives the editor.

export type TuiMouseEventType = "press" | "release" | "move" | "drag" | "click" | "wheel";
export type TuiMouseButton = "left" | "middle" | "right" | "none";

/** Normalized cell-based mouse event. Coordinates are zero-based. */
export interface TuiMouseEvent {
	type: TuiMouseEventType;
	button: TuiMouseButton;
	/** Coordinates local to the receiving component. */
	x: number;
	y: number;
	/** Absolute terminal coordinates. */
	screenX: number;
	screenY: number;
	/** Current component bounds. */
	width: number;
	height: number;
	shift: boolean;
	alt: boolean;
	ctrl: boolean;
	/** Logical lines. Negative values scroll up. */
	wheelDelta?: number;
	/** Consecutive click count when type is click. */
	clickCount?: number;
}

export interface TuiMouseEventResult {
	/** Stop propagation and suppress renderer-level fallback behavior. */
	handled?: boolean;
	/** Route subsequent drag/release events to this component. Implies handled. */
	capture?: boolean;
	/** Give keyboard focus to this component. Implies handled. */
	focus?: boolean;
	/**
	 * Explicitly request or suppress a render. Move and release default to false;
	 * press, click, drag, and wheel default to true.
	 */
	render?: boolean;
}

export interface Component {
	/**
	 * Render the component to lines for the given viewport width
	 * @param width - Current viewport width
	 * @returns Array of strings, each representing a line
	 */
	render(width: number): string[];

	/** Optional handler for keyboard input when component has focus. */
	handleInput?(data: string): void;

	/** Optional normalized mouse handler. */
	handleMouse?(event: TuiMouseEvent): TuiMouseEventResult | undefined;

	/**
	 * If true, component receives key release events (Kitty protocol).
	 * Default is false - release events are filtered out.
	 */
	wantsKeyRelease?: boolean;

	/**
	 * Invalidate any cached rendering state.
	 * Called when theme changes or when component needs to re-render from scratch.
	 */
	invalidate(): void;
}

export interface Focusable {
	/** Set by TUI when focus changes. Component should emit CURSOR_MARKER when true. */
	focused: boolean;
}

export const CURSOR_MARKER = "\x1b_pi:c\x07";

export interface TUI {
	requestRender(): void;
	readonly terminal: { readonly rows: number };
}
