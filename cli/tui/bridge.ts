import type { TuiAction } from './types.js'

type DispatchFn = (action: TuiAction) => void

let _dispatch: DispatchFn | null = null

export function setDispatcher(fn: DispatchFn | null): void {
  _dispatch = fn
}

export function dispatch(action: TuiAction): void {
  _dispatch?.(action)
}
