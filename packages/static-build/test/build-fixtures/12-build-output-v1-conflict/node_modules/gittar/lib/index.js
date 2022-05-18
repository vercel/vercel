'use strict';
const fs = require('fs');
const tar = require('tar');
const path = require('path');
const https = require('https');
const mkdirp = require('mkdirp');
const parse = require('url').parse;
const lookup = require('dns').lookup;

const HOME = require('os').homedir();
const DIR = path.join(HOME, '.gittar');

const strip = (a, b, c) => a.replace(b, '').replace(c, '');

function download(uri, file) {
	return new Promise((res, rej) => {
		https.get(uri, r => {
			const code = r.statusCode;
			if (code >= 400) return rej({ code, message:r.statusMessage });
			if (code > 300 && code < 400) return download(r.headers.location, file).then(res);
			const write = writer(file).on('finish', _ => res(file));
			r.pipe(write);
		}).on('error', rej);
	});
}

function writer(file) {
	file = path.normalize(file);
	mkdirp.sync(path.dirname(file));
	return fs.createWriteStream(file);
}

function getHint(str) {
	const arr = str.match(/^(git(hub|lab)|bitbucket):/i);
	return arr && arr[1];
}

function getTarFile(obj) {
	return path.join(DIR, obj.site, obj.repo, `${obj.type}.tar.gz`);
}

function getTarUrl(obj) {
	switch (obj.site) {
		case 'bitbucket':
			return `https://bitbucket.org/${obj.repo}/get/${obj.type}.tar.gz`;
		case 'gitlab':
			return `https://gitlab.com/${obj.repo}/repository/archive.tar.gz?ref=${obj.type}`;
		default:
			return `https://github.com/${obj.repo}/archive/${obj.type}.tar.gz`;
	}
}

function parser(uri, host) {
	const info = parse(uri);
	const site = getHint(uri) || host || 'github';
	const repo = strip(uri, info.protocol, info.hash);
	const type = (info.hash || '#master').substr(1);
	return { site, repo, type };
}

function exists(file) {
	// file is a `user/repo#tag`
	if (!path.isAbsolute(file)) {
		file = getTarFile( parser(file) );
	}
	return fs.existsSync(file) && file;
}

function run(arr) {
	return new Promise((res, rej) => {
		if (arr.length === 0) rej();
		const next = () => run(arr.slice(1)).then(res);
		return arr[0]().then(val => val ? res(val) : next()).catch(rej);
	});
}

exports.fetch = function (repo, opts) {
	opts = opts || {};
	const info = parser(repo, opts.host);
	const file = getTarFile(info);
	const uri = getTarUrl(info);

	const local = _ => Promise.resolve( exists(file) );
	const remote = _ => download(uri, file);

	return new Promise((res, rej) => {
		lookup('google.com', err => {
			const isOffline = !!err;
			let order = [local, remote];

			if (opts.useCache || isOffline) {
				order = [local];
			} else if (opts.force || info.type === 'master') {
				order = [remote, local];
			}

			return run(order).then(res).catch(rej);
		});
	});
}

exports.extract = function (file, dest, opts) {
	file = exists(file);
	dest = path.resolve(dest || '.');
	return new Promise((res, rej) => {
		const ok = _ => res(dest);
		opts = Object.assign({ strip:1 }, opts, { file, cwd:dest });
		return file ? mkdirp(dest, err => err ? rej(err) : tar.extract(opts).then(ok).catch(rej)) : rej();
	});
}
