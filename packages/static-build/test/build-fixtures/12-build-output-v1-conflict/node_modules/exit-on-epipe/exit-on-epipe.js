/* exit-on-epipe.js (C) 2015-present SheetJS -- http://sheetjs.com */
/* vim: set ts=2: */
/*jshint eqnull:true, node:true */
var eoepipe = function eoepipeit(S/*:events$EventEmitter*/, bail/*:?()=>any*/) {
	if(!S || !S.on) return;
	if(!bail && typeof process !== 'undefined') bail = process.exit;
	var eoe = function eoeit(err/*:ErrnoError*/) {
		if(err.code === 'EPIPE' || err.errno === /*EPIPE*/32) { if(bail) bail(); else return; }
		var cnt = S.listenerCount ? S.listenerCount('error') : S.listeners('error').length;
		if(cnt == 1) {
			S.removeListener('error', eoe);
			S.emit('error', err);
			S.on('error', eoe);
		}
	};
	S.on('error', eoe);
};

if(typeof module !== 'undefined') module.exports = eoepipe;
if(typeof process !== 'undefined') eoepipe(process.stdout);
