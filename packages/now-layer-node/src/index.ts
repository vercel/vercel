import { tmpdir } from 'os';
import { join } from 'path';
import { glob } from '@now/build-utils';
import { mkdir, remove, pathExists } from 'fs-extra';
import { installNode } from './install-node';

interface LayerConfig {
	runtimeVersion: string;
	platform: string;
	arch: string;
}

export async function buildLayer({
	runtimeVersion,
	platform,
	arch,
}: LayerConfig) {
	const dir = join(
		tmpdir(),
		`now-layer-node-${runtimeVersion}-${platform}-${arch}`
	);
	const exists = await pathExists(dir);
	if (exists) {
		await remove(dir);
	}
	await mkdir(dir);
	await installNode(dir, runtimeVersion, platform, arch);
	const files = await glob('{bin/node,bin/node.exe,include/**}', {
		cwd: dir,
	});
	return { files };
}
