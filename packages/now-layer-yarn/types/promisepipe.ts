declare module 'promisepipe' {
	import { Stream } from 'stream';
	export default function pipe(...args: Stream[]): Promise<void>;
}
