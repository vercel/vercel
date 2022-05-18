import execa from 'execa';

const env = {
	LC_CTYPE: 'UTF-8',
};

const clipboard = {
	copy: async options => execa('pbcopy', {...options, env}),
	paste: async options => {
		const {stdout} = await execa('pbpaste', {...options, env});
		return stdout;
	},
	copySync: options => execa.sync('pbcopy', {...options, env}),
	pasteSync: options => execa.sync('pbpaste', {...options, env}).stdout,
};

export default clipboard;
