let cachedSoftwareWebGL: boolean | null = null;

/**
 * Probes once whether the current device/browser uses a software WebGL rasterizer
 * (e.g. SwiftShader, llvmpipe, Microsoft Basic Render Driver) and caches the result
 * globally so multiple 3D views never spin up redundant probe WebGL contexts.
 */
export function isSoftwareWebGL(): boolean {
  if (cachedSoftwareWebGL !== null) return cachedSoftwareWebGL;
  if (typeof document === 'undefined') {
    cachedSoftwareWebGL = false;
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      cachedSoftwareWebGL = true;
      return true;
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const param = dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const renderer = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareWebGL = /SwiftShader|llvmpipe|softpipe|Software Rasterizer|Software|Microsoft Basic Render|Basic Render/i.test(renderer);
  } catch {
    cachedSoftwareWebGL = false;
  }
  return cachedSoftwareWebGL;
}
