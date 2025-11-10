import { join, relative } from 'path';
import fs from 'fs-extra';
import { put, list } from '@vercel/blob';

const repoRoot = join(__dirname, '..');
const tarballsDir = join(repoRoot, 'public', 'tarballs');
const blobPrefix = 'vercel-cli/2025-09-16-override-to-2026-02-03';

async function uploadFile(filePath: string, relativePath: string) {
  const fileBuffer = await fs.readFile(filePath);
  const blobPath = `${blobPrefix}/${relativePath}`;

  const blob = await put(blobPath, fileBuffer, {
    access: 'public',
  });

  return blob;
}

async function getAllFiles(
  dir: string,
  baseDir: string = dir
): Promise<Array<{ filePath: string; relativePath: string }>> {
  const files: Array<{ filePath: string; relativePath: string }> = [];
  const items = await fs.readdir(dir);

  for (const item of items) {
    const fullPath = join(dir, item);
    const stats = await fs.stat(fullPath);

    if (stats.isDirectory()) {
      const subFiles = await getAllFiles(fullPath, baseDir);
      files.push(...subFiles);
    } else if (stats.isFile()) {
      const relativePath = relative(baseDir, fullPath);
      files.push({ filePath: fullPath, relativePath });
    }
  }

  return files;
}

async function main() {
  try {
    const dirExists = await fs.pathExists(tarballsDir);
    if (!dirExists) {
      console.log(`Directory ${tarballsDir} does not exist.`);
      return;
    }

    const files = await getAllFiles(tarballsDir);

    if (files.length === 0) {
      console.log(`No files found in ${tarballsDir}`);
      return;
    }

    console.log(`Found ${files.length} files to upload from ${tarballsDir}`);

    const uploadPromises = files.map(async ({ filePath, relativePath }) => {
      console.log(`Uploading ${relativePath}...`);
      const blob = await uploadFile(filePath, relativePath);
      console.log(`✓ Uploaded ${relativePath} to ${blob.url}`);
      return blob;
    });

    const results = await Promise.all(uploadPromises);

    console.log(
      `\nSuccessfully uploaded ${results.length} files to Vercel Blob`
    );
    console.log(`Prefix: ${blobPrefix}`);

    console.log('\nListing uploaded files:');
    const { blobs } = await list({ prefix: blobPrefix });
    blobs.forEach(blob => {
      console.log(`  - ${blob.pathname} (${blob.size} bytes)`);
    });
  } catch (error) {
    console.error('Error during upload:', error);
    throw error;
  }
}

main().catch(err => {
  console.log('error uploading to vercel blob:', err);
  process.exit(1);
});
