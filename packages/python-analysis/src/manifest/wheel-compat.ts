import { importWasmModule } from '../wasm/load';

/**
 * Check if a wheel filename is compatible with a given platform.
 *
 * Uses uv's `WheelFilename::is_compatible()` and `Tags::from_env()` via WASM
 * -- the same logic uv uses for resolution.
 *
 * @param wheelFilename - The wheel filename (e.g. "numpy-1.26.4-cp312-cp312-manylinux_2_17_x86_64.whl")
 * @param pythonMajor - Python major version (e.g. 3)
 * @param pythonMinor - Python minor version (e.g. 12)
 * @param osName - OS name: "manylinux", "musllinux", "macos", or "windows"
 * @param archName - Architecture: "x86_64", "aarch64", etc.
 * @param osMajor - OS major version (glibc major for Linux, macOS major version)
 * @param osMinor - OS minor version (glibc minor for Linux, macOS minor version)
 * @returns true if the wheel is compatible with the platform
 */
export async function isWheelCompatible(
  wheelFilename: string,
  pythonMajor: number,
  pythonMinor: number,
  osName: string,
  archName: string,
  osMajor: number,
  osMinor: number
): Promise<boolean> {
  const mod = await importWasmModule();
  return mod.isWheelCompatible(
    wheelFilename,
    pythonMajor,
    pythonMinor,
    osName,
    archName,
    osMajor,
    osMinor
  );
}

/**
 * Evaluate a PEP 508 environment marker against a target environment.
 *
 * Uses uv's `MarkerTree::evaluate()` via WASM -- the same logic uv uses
 * for dependency resolution.
 *
 * @param marker - PEP 508 marker expression (e.g. "sys_platform == 'win32'")
 * @param pythonMajor - Python major version (e.g. 3)
 * @param pythonMinor - Python minor version (e.g. 12)
 * @param sysPlatform - sys_platform value: "linux", "win32", "darwin"
 * @param platformMachine - platform_machine value: "x86_64", "aarch64", etc.
 * @returns true if the marker is satisfied for the target environment
 */
export async function evaluateMarker(
  marker: string,
  pythonMajor: number,
  pythonMinor: number,
  sysPlatform: string,
  platformMachine: string
): Promise<boolean> {
  const mod = await importWasmModule();
  return mod.evaluateMarker(
    marker,
    pythonMajor,
    pythonMinor,
    sysPlatform,
    platformMachine
  );
}
