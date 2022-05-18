#!/usr/bin/env node
/* crc32.js (C) 2014-present SheetJS -- http://sheetjs.com */
/* eslint-env node */
/* vim: set ts=2 ft=javascript: */
/*jshint node:true */

var X/*:CRC32Module*/;
try { X = require('../'); } catch(e) { X = require('crc-32'); }

function help()/*:number*/ {
[
"usage: crc32 [options] [filename]",
"",
"Options:",
"    -h, --help           output usage information",
"    -V, --version        output the version number",
"    -S, --seed=<n>       use integer seed as starting value (rolling CRC)",
"    -H, --hex-seed=<h>   use hex seed as starting value (rolling CRC)",
"    -d, --signed         print result with format `%d` (default)",
"    -u, --unsigned       print result with format `%u`",
"    -x, --hex            print result with format `%0.8x`",
"    -X, --HEX            print result with format `%0.8X`",
"    -F, --format=<s>     use specified printf format",
"",
"Set filename = '-' or pipe data into crc32 to read from stdin",
"Default output mode is signed (-d)",
""
].forEach(function(l) { console.log(l); });
	return 0;
}

function version()/*:number*/ { console.log(X.version); return 0; }

var fs = require('fs');
require('exit-on-epipe');

function die(msg/*:string*/, ec/*:?number*/)/*:void*/ { console.error(msg); process.exit(ec || 0); }

var args/*:Array<string>*/ = process.argv.slice(2);
var filename/*:string*/ = "";
var fmt/*:string*/ = "";
var seed = 0, r = 10;

for(var i = 0; i < args.length; ++i) {
	var arg = args[i];
	if(arg.charCodeAt(0) != 45) { if(filename === "") filename = arg; continue; }
	var m = arg.indexOf("=") == -1 ? arg : arg.substr(0, arg.indexOf("="));
	switch(m) {
		case "-": filename = "-"; break;

		case "--help":     case "-h": process.exit(help()); break;
		case "--version":  case "-V": process.exit(version()); break;

		case "--signed":   case "-d": fmt = "%d"; break;
		case "--unsigned": case "-u": fmt = "%u"; break;
		case "--hex":      case "-x": fmt = "%0.8x"; break;
		case "--HEX":      case "-X": fmt = "%0.8X"; break;
		case "--format":   case "-F":
			fmt = ((m!=arg) ? arg.substr(m.length+1) : args[++i])||""; break;

		case "--hex-seed": case "-H": r = 16;
		/* falls through */
		case "--seed":     case "-S":
			seed=parseInt((m!=arg) ? arg.substr(m.length+1) : args[++i], r)||0; break;

		default: die("crc32: unrecognized option `" + arg + "'", 22);
	}
}

if(!process.stdin.isTTY) filename = filename || "-";
if(filename.length===0) die("crc32: must specify a filename ('-' for stdin)",1);

var crc32 = seed;
// $FlowIgnore -- Writable is callable but type sig disagrees
var writable = require('stream').Writable();
writable._write = function(chunk, e, cb) { crc32 = X.buf(chunk, crc32); cb(); };
writable._writev = function(chunks, cb) {
	chunks.forEach(function(c) { crc32 = X.buf(c.chunk, crc32);});
	cb();
};
writable.on('finish', function() {
	console.log(fmt === "" ? crc32 : require("printj").sprintf(fmt, crc32));
});

if(filename === "-") process.stdin.pipe(writable);
else if(fs.existsSync(filename)) fs.createReadStream(filename).pipe(writable);
else die("crc32: " + filename + ": No such file or directory", 2);
