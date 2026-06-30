import type { Language, RuntimePreset, Runtime } from '@vercel/frameworks';
import { runtimes } from '@vercel/frameworks';
import { DetectorFilesystem } from './detectors/filesystem';
import { checkDetector } from './detectors/check';

export interface DetectRuntimeOptions {
  fs: DetectorFilesystem;
  /**
   * The language to pick a runtime for.
   */
  language: Language;
}

/**
 * Resolves the runtime to use for a given language by checking the project's
 * filesystem against each registered alternative in order.
 *
 * Falls back to the language's default runtime when no alternative matches.
 */
export async function detectRuntime({
  fs,
  language,
}: DetectRuntimeOptions): Promise<Runtime> {
  const entry = runtimes[language];
  if (entry.alternatives) {
    for (const preset of entry.alternatives) {
      if (await detectorsMatch(fs, preset.detectors)) {
        return preset.runtime;
      }
    }
  }
  return entry.default;
}

async function detectorsMatch(
  fs: DetectorFilesystem,
  detectors: RuntimePreset['detectors']
): Promise<boolean> {
  const { every, some } = detectors;
  if (every) {
    for (const item of every) {
      if (!(await checkDetector(fs, item))) return false;
    }
  }
  if (some) {
    let matched = false;
    for (const item of some) {
      if (await checkDetector(fs, item)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}
