import { DetectorFilesystem } from './detectors/filesystem';
import semver from 'semver';

interface InstrumentationDependency {
  name: string;
  minVersion: string;
}

const VERCEL_OTEL = '@vercel/otel';
const OPENTELEMETRY_SDK_TRACE_NODE = '@opentelemetry/sdk-trace-node';
const OPENTELEMETRY_API = '@opentelemetry/api';

const tracingDependencies: InstrumentationDependency[] = [
  { name: VERCEL_OTEL, minVersion: '1.11.0' },
  { name: OPENTELEMETRY_SDK_TRACE_NODE, minVersion: '1.19.0' },
  { name: OPENTELEMETRY_API, minVersion: '1.7.0' },
];

/**
 * Detects if any OpenTelemetry dependencies are used and if they meet the required versions
 */
export async function detectInstrumentation(
  fs: DetectorFilesystem
): Promise<boolean> {
  // Skip if package.json doesn't exist
  if ((await fs.hasPath('package.json')) === false) {
    return false;
  }

  // Check if package.json is a file
  if ((await fs.isFile('package.json')) === false) {
    return false;
  }

  // Read package.json content
  const content = await fs.readFile('package.json');
  const packageJsonContent = content.toString();

  let hasInstrumentation = false;

  for (const dependency of tracingDependencies) {
    // Regular expression to find the dependency and its version in either dependencies or devDependencies
    const regex = new RegExp(
      `"(dev)?(d|D)ependencies":\\s*{[^}]*"${dependency.name}":\\s*"(.+?)"[^}]*}`,
      'm'
    );

    const match = packageJsonContent.match(regex);

    if (match && match[3]) {
      const detectedVersion = match[3];
      // Clean the version string by removing any leading ^ or ~ characters
      const cleanVersion = detectedVersion.replace(/[\^~]/, '');

      // Check if the detected version meets the minimum version requirement
      if (
        semver.valid(cleanVersion) &&
        semver.gte(cleanVersion, dependency.minVersion)
      ) {
        console.log(
          `Detected OpenTelemetry dependency: ${dependency.name}@${cleanVersion}, which meets the minimum version requirement of ${dependency.minVersion}`
        );
        hasInstrumentation = true;
        break;
      }
    }
  }

  return hasInstrumentation;
}
