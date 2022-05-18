import fs from 'node:fs';
import stream from 'node:stream';
import zlib from 'node:zlib';
import {promisify} from 'node:util';
import duplexer from 'duplexer';

const getOptions = options => ({level: 9, ...options});
const gzip = promisify(zlib.gzip);

export async function gzipSize(input, options) {
	if (!input) {
		return 0;
	}

	const data = await gzip(input, getOptions(options));
	return data.length;
}

export function gzipSizeSync(input, options) {
	return zlib.gzipSync(input, getOptions(options)).length;
}

export function gzipSizeFromFile(path, options) {
	// TODO: Use `stream.pipeline` here.

	return new Promise((resolve, reject) => {
		const stream = fs.createReadStream(path);
		stream.on('error', reject);

		const gzipStream = stream.pipe(gzipSizeStream(options));
		gzipStream.on('error', reject);
		gzipStream.on('gzip-size', resolve);
	});
}

export function gzipSizeFromFileSync(path, options) {
	return gzipSizeSync(fs.readFileSync(path), options);
}

export function gzipSizeStream(options) {
	// TODO: Use `stream.pipeline` here.

	const input = new stream.PassThrough();
	const output = new stream.PassThrough();
	const wrapper = duplexer(input, output);

	let gzipSize = 0;
	const gzip = zlib.createGzip(getOptions(options))
		.on('data', buf => {
			gzipSize += buf.length;
		})
		.on('error', () => {
			wrapper.gzipSize = 0;
		})
		.on('end', () => {
			wrapper.gzipSize = gzipSize;
			wrapper.emit('gzip-size', gzipSize);
			output.end();
		});

	input.pipe(gzip);
	input.pipe(output, {end: false});

	return wrapper;
}
