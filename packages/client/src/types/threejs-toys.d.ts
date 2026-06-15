declare module 'threejs-toys' {
  interface NeonCursorParams {
    el: HTMLElement;
    shaderPoints?: number;
    curvePoints?: number;
    curveLerp?: number;
    radius1?: number;
    radius2?: number;
    velocityTreshold?: number;
    sleepRadiusX?: number;
    sleepRadiusY?: number;
    sleepTimeCoefX?: number;
    sleepTimeCoefY?: number;
  }

  export function neonCursor(params: NeonCursorParams): { config: Record<string, unknown> };
}
