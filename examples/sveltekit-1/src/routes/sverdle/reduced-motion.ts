import { readable } from 'svelte/store';
import { browser } from '$app/environment';

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';

const getInitialMotionPreference = () => {
	if (!browser) return false;
	return window.matchMedia(reducedMotionQuery).matches;
};

export const reducedMotion = readable(getInitialMotionPreference(), (set) => {
	if (browser) {
		const setReducedMotion = (event: MediaQueryListEvent) => {
			set(event.matches);
		};
		const mediaQueryList = window.matchMedia(reducedMotionQuery);
		mediaQueryList.addEventListener('change', setReducedMotion);

		return () => {
			mediaQueryList.removeEventListener('change', setReducedMotion);
		};
	}
});
