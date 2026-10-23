import {
  releaseThemeKey,
  type ResolvedReleaseTheme,
} from "../domain/releaseTheme";
export interface ThemeLayer {
  key: string;
  theme: ResolvedReleaseTheme;
}
export interface ThemeTransition {
  target: string;
  base?: ThemeLayer;
  incoming?: ThemeLayer;
  pending?: ThemeLayer;
  visible: boolean;
  reverting: boolean;
}
export type ThemeAction =
  | { type: "target"; key: string }
  | { type: "ready"; theme: ResolvedReleaseTheme }
  | { type: "enter"; key: string }
  | { type: "finish"; key: string };
const incoming = (
  state: ThemeTransition,
  layer: ThemeLayer,
): ThemeTransition => ({
  ...state,
  incoming: layer,
  pending: undefined,
  visible: false,
  reverting: false,
});
export function transitionTheme(
  state: ThemeTransition,
  action: ThemeAction,
): ThemeTransition {
  if (action.type === "target") {
    if (action.key === state.target) return state;
    if (state.incoming && !state.visible && !state.reverting)
      return {
        ...state,
        target: action.key,
        incoming: undefined,
        pending: undefined,
      };
    return {
      ...state,
      target: action.key,
      pending: undefined,
      reverting: Boolean(state.incoming && state.incoming.key !== action.key),
      visible: state.incoming?.key === action.key && state.visible,
    };
  }
  if (action.type === "ready") {
    const layer = { key: releaseThemeKey(action.theme), theme: action.theme };
    if (layer.key !== state.target || layer.key === state.base?.key)
      return state;
    if (!state.base) return { ...state, base: layer };
    if (state.incoming) return { ...state, pending: layer };
    return incoming(state, layer);
  }
  if (action.type === "enter") {
    if (state.incoming?.key !== action.key || state.target !== action.key)
      return state;
    return { ...state, visible: true, reverting: false };
  }
  if (state.incoming?.key !== action.key) return state;
  if (state.reverting) {
    const cleared = {
      ...state,
      incoming: undefined,
      visible: false,
      reverting: false,
    };
    return state.pending?.key === state.target
      ? incoming(cleared, state.pending)
      : { ...cleared, pending: undefined };
  }
  if (!state.visible || state.target !== action.key) return state;
  return {
    ...state,
    base: state.incoming,
    incoming: undefined,
    pending: undefined,
    visible: false,
  };
}
