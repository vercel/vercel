import execa from 'execa';

const handler = error => {
	if (error.code === 'ENOENT') {
		throw new Error('Couldn\'t find the termux-api scripts. You can install them with: apt install termux-api');
	}

	throw error;
};

const clipboard = {
	copy: async options => {
		try {
			await execa('termux-clipboard-set', options);
		} catch (error) {
			handler(error);
		}
	},
	paste: async options => {
		try {
			const {stdout} = await execa('termux-clipboard-get', options);
			return stdout;
		} catch (error) {
			handler(error);
		}
	},
	copySync: options => {
		try {
			execa.sync('termux-clipboard-set', options);
		} catch (error) {
			handler(error);
		}
	},
	pasteSync: options => {
		try {
			return execa.sync('termux-clipboard-get', options).stdout;
		} catch (error) {
			handler(error);
		}
	},
};

export default clipboard;
