/* printj.js (C) 2016-present SheetJS -- http://sheetjs.com */
/* vim: set ts=2: */
/*jshint sub:true, eqnull:true */
/*exported PRINTJ */
var PRINTJ;
(function (factory) {
	/*jshint ignore:start */
	/*eslint-disable */
	if(typeof DO_NOT_EXPORT_PRINTJ === 'undefined') {
		if('object' === typeof exports) {
			factory(exports);
		} else if ('function' === typeof define && define.amd) {
			define(function () {
				var module = {};
				factory(module);
				return module;
			});
		} else {
			factory(PRINTJ = {});
		}
	} else {
		factory(PRINTJ = {});
	}
	/*eslint-enable */
	/*jshint ignore:end */
}(function(PRINTJ) {

PRINTJ.version = '1.1.2';

function tokenize(fmt) {
	var out = [];
	var start = 0;

	var i = 0;
	var infmt = false;
	var fmtparam = "", fmtflags = "", fmtwidth = "", fmtprec = "", fmtlen = "";

	var c = 0;

	var L = fmt.length;

	for(; i < L; ++i) {
		c = fmt.charCodeAt(i);
		if(!infmt) {

			if(c !== 37) continue;

			if(start < i) out.push(["L", fmt.substring(start, i)]);
			start = i;
			infmt = true;
			continue;
		}

		if(c >= 48 && c < 58)	{
				if(fmtprec.length) fmtprec += String.fromCharCode(c);
				else if(c == 48 && !fmtwidth.length) fmtflags += String.fromCharCode(c);
				else fmtwidth += String.fromCharCode(c);
		} else switch(c) {
			/* positional */
			case 36:
				if(fmtprec.length) fmtprec += "$";
				else if(fmtwidth.charAt(0) == "*") fmtwidth += "$";
				else { fmtparam = fmtwidth + "$"; fmtwidth = ""; }
				break;

			/* flags */
			case 39: fmtflags += "'"; break;
			case 45: fmtflags += "-"; break;
			case 43: fmtflags += "+"; break;
			case 32: fmtflags += " "; break;
			case 35: fmtflags += "#"; break;

			/* width and precision */
			case 46: fmtprec = "."; break;
			case 42:
				if(fmtprec.charAt(0) == ".") fmtprec += "*";
				else fmtwidth += "*";
				break;

			/* length */
			case 104:
			case 108:
				if(fmtlen.length > 1) throw "bad length " + fmtlen + String(c);
				fmtlen += String.fromCharCode(c);
				break;

			case  76:
			case 106:
			case 122:
			case 116:
			case 113:
			case  90:
			case 119:
				if(fmtlen !== "") throw "bad length " + fmtlen + String.fromCharCode(c);
				fmtlen = String.fromCharCode(c);
				break;

			case 73:
				if(fmtlen !== "") throw "bad length " + fmtlen + 'I';
				fmtlen = 'I';
				break;

			/* conversion */
			case 100:
			case 105:
			case 111:
			case 117:
			case 120:
			case 88:
			case 102:
			case 70:
			case 101:
			case 69:
			case 103:
			case 71:
			case 97:
			case 65:
			case 99:
			case 67:
			case 115:
			case 83:
			case 112:
			case 110:
			case 68:
			case 85:
			case 79:
			case 109:
			case 98:
			case 66:
			case 121:
			case 89:
			case 74:
			case 86:
			case 84:
			case 37:
				infmt = false;
				if(fmtprec.length > 1) fmtprec = fmtprec.substr(1);
				out.push([String.fromCharCode(c), fmt.substring(start, i+1), fmtparam, fmtflags, fmtwidth, fmtprec, fmtlen]);
				start = i+1;
				fmtlen = fmtprec = fmtwidth = fmtflags = fmtparam = "";
				break;
			default:
				throw new Error("Invalid format string starting with |" + fmt.substring(start, i+1) + "|");
		}

	}

	if(start < fmt.length) out.push(["L", fmt.substring(start)]);
	return out;
}

//#define PAD_(x,c) (x >= 0 ? new Array(((x)|0) + 1).join((c)) : "")
var padstr = {
	" ": "                                 ",
	"0": "000000000000000000000000000000000",
	"7": "777777777777777777777777777777777",
	"f": "fffffffffffffffffffffffffffffffff"
};

/*global process:true, util:true, require:true */
if(typeof process !== 'undefined' && !!process.versions && !!process.versions.node) util=require("util");
var u_inspect = (typeof util != 'undefined') ? util.inspect : JSON.stringify;

function doit(t, args) {
	var o = [];
	var argidx = 0, idx = 0;
	var Vnum = 0;
	var pad = "";
	for(var i = 0; i < t.length; ++i) {
		var m = t[i], c = (m[0]).charCodeAt(0);
		/* m order: conv full param flags width prec length */

		if(c === /*L*/ 76) { o.push(m[1]); continue; }
		if(c === /*%*/ 37) { o.push("%"); continue; }

		var O = "";
		var isnum = 0, radix = 10, bytes = 4, sign = false;

		/* flags */
		var flags = m[3]||"";
		var alt = flags.indexOf("#") > -1;

		/* position */
		if(m[2]) argidx = parseInt(m[2])-1;
		/* %m special case */
		else if(c === /*m*/ 109 && !alt) { o.push("Success"); continue; }

		/* grab width */
		var width =  0; if(m[ 4] != null && m[ 4].length > 0) { if(m[ 4].charAt(0) !== '*') width = parseInt(m[ 4], 10); else if(m[ 4].length === 1) width = args[idx++]; else width = args[parseInt(m[ 4].substr(1), 10)-1]; }

		/* grab precision */
		var prec =  -1; if(m[ 5] != null && m[ 5].length > 0) { if(m[ 5].charAt(0) !== '*') prec = parseInt(m[ 5], 10); else if(m[ 5].length === 1) prec = args[idx++]; else prec = args[parseInt(m[ 5].substr(1), 10)-1]; }

		/* position not specified */
		if(!m[2]) argidx = idx++;

		/* grab argument */
		var arg = args[argidx];

		/* grab length */
		var len = m[6] || "";

		switch(c) {
			/* str cCsS */

			case /*S*/  83:
			case /*s*/ 115:
				/* only valid flag is "-" for left justification */
				O = String(arg);
				if( prec >= 0) O = O.substr(0,  prec);
				if( width > O.length || - width > O.length) { if(( flags.indexOf("-") == -1 ||  width < 0) &&  flags.indexOf("0") != -1) { pad = ( width - O.length >= 0 ? padstr["0"].substr(0, width - O.length) : ""); O = pad + O; } else { pad = ( width - O.length >= 0 ? padstr[" "].substr(0, width - O.length) : ""); O =  flags.indexOf("-") > -1 ? O + pad : pad + O; } }
				break;

			/* first char of string or convert */
			case /*C*/  67:
			case /*c*/  99:
				switch(typeof arg) {
					case "number":
						var cc = arg;
						if(c == 67 || len.charCodeAt(0) === /*l*/ 108) {  cc &= 0xFFFFFFFF; O = String.fromCharCode( cc); }
						else {  cc &= 0xFF; O = String.fromCharCode( cc); }
						break;
					case "string": O = arg.charAt(0); break;
					default: O = String(arg).charAt(0);
				}
				if( width > O.length || - width > O.length) { if(( flags.indexOf("-") == -1 ||  width < 0) &&  flags.indexOf("0") != -1) { pad = ( width - O.length >= 0 ? padstr["0"].substr(0, width - O.length) : ""); O = pad + O; } else { pad = ( width - O.length >= 0 ? padstr[" "].substr(0, width - O.length) : ""); O =  flags.indexOf("-") > -1 ? O + pad : pad + O; } }
				break;

			/* int diDuUoOxXbB */

			/* signed integer */
			case /*D*/  68: bytes = 8;
			/* falls through */
			case /*d*/ 100:
			case /*i*/ 105: isnum = -1; sign = true; break;

			/* unsigned integer */
			case /*U*/  85: bytes = 8;
			/* falls through */
			case /*u*/ 117: isnum = -1; break;

			/* unsigned octal */
			case /*O*/  79: bytes = 8;
			/* falls through */
			case /*o*/ 111: isnum = -1; radix = (8); break;

			/* unsigned hex */
			case /*x*/ 120: isnum = -1; radix = (-16); break;
			case /*X*/  88: isnum = -1; radix = (16); break;

			/* unsigned binary (extension) */
			case /*B*/  66: bytes = 8;
			/* falls through */
			case /*b*/  98: isnum = -1; radix = (2); break;

			/* flt fegFEGaA */

			/* floating point logic */
			case /*F*/  70:
			case /*f*/ 102: isnum = (1); break;

			case /*E*/  69:
			case /*e*/ 101: isnum = (2); break;

			case /*G*/  71:
			case /*g*/ 103: isnum = (3); break;

			/* floating hex */
			case /*A*/  65:
			case /*a*/  97: isnum = (4); break;

			/* misc pnmJVTyY */

			/* JS has no concept of pointers so interpret the `l` key as an address */
			case /*p*/ 112:
				Vnum = typeof arg == "number" ? arg : arg ? Number(arg.l) : -1;
				if(isNaN(Vnum)) Vnum = -1;
				if(alt) O = Vnum.toString(10);
				else {
					Vnum = Math.abs(Vnum);
					O = "0x" + Vnum.toString(16).toLowerCase();
				}
				break;

			/* store length in the `len` key */
			case /*n*/ 110:
				if(arg) { arg.len=0; for(var oo = 0; oo < o.length; ++oo) arg.len += o[oo].length; }
				continue;

			/* process error */
			case /*m*/ 109:
				if(!(arg instanceof Error)) O = "Success";
				else if(arg.message) O = arg.message;
				else if(arg.errno) O = "Error number " + arg.errno;
				else O = "Error " + String(arg);
				break;

			/* JS-specific conversions (extension) */
			case /*J*/  74: O = (alt ? u_inspect : JSON.stringify)(arg); break;
			case /*V*/  86: O = arg == null ? "null" : String(arg.valueOf()); break;
			case /*T*/  84:
				if(alt) { /* from '[object %s]' extract %s */
					O = Object.prototype.toString.call(arg).substr(8);
					O = O.substr(0, O.length - 1);
				} else O = typeof arg;
				break;

			/* boolean (extension) */
			case /*Y*/  89:
			case /*y*/ 121:
				O = Boolean(arg) ? (alt ? "yes" : "true") : (alt ? "no" : "false");
				if(c == /*Y*/ 89) O = O.toUpperCase();
				if( prec >= 0) O = O.substr(0,  prec);
				if( width > O.length || - width > O.length) { if(( flags.indexOf("-") == -1 ||  width < 0) &&  flags.indexOf("0") != -1) { pad = ( width - O.length >= 0 ? padstr["0"].substr(0, width - O.length) : ""); O = pad + O; } else { pad = ( width - O.length >= 0 ? padstr[" "].substr(0, width - O.length) : ""); O =  flags.indexOf("-") > -1 ? O + pad : pad + O; } }
				break;

		}

		if(width < 0) { width = -width; flags += "-"; }

		if(isnum == -1) {

			Vnum = Number(arg);

			/* parse byte length field */

			switch(len) {
				/* char */
				case "hh": { bytes = 1; } break;
				/* short */
				case "h":  { bytes = 2; } break;

				/* long */
				case "l":  { if(bytes == 4) bytes = 8; } break;

				/* long long */
				case "L":
				case "q":
				case "ll": { if(bytes == 4) bytes = 8; } break;

				/* intmax_t */
				case "j":  { if(bytes == 4) bytes = 8; } break;

				/* ptrdiff_t */
				case "t":  { if(bytes == 4) bytes = 8; } break;

				/* size_t */
				case "z":
				case "Z":  { if(bytes == 4) bytes = 8; } break;

				/* CRT size_t or ptrdiff_t */
				case "I":

					{ if(bytes == 4) bytes = 8; }

					break;

				/* CRT wchar_t */
				case "w": break;
			}

			/* restrict value */

			switch(bytes) {
				case 1: Vnum = (Vnum & 0xFF); if(sign && (Vnum >  0x7F)) Vnum -= (0xFF + 1); break;
				case 2: Vnum = (Vnum & 0xFFFF); if(sign && (Vnum >  0x7FFF)) Vnum -= (0xFFFF + 1); break;
				case 4: Vnum = sign ? (Vnum | 0) : (Vnum >>> 0); break;
				default: Vnum = isNaN(Vnum) ? 0 : Math.round(Vnum); break;
			}

			/* generate string */
			if(bytes > 4 && Vnum < 0 && !sign) {
				if(radix == 16 || radix == -16) {
					O = (Vnum>>>0).toString(16);
					Vnum = Math.floor((Vnum - (Vnum >>> 0)) / Math.pow(2,32));
					O = (Vnum>>>0).toString(16) + (8 - O.length >= 0 ? padstr[ "0"].substr(0,8 - O.length) : "") + O;
					O = (16 - O.length >= 0 ? padstr[ "f"].substr(0,16 - O.length) : "") + O;
					if(radix == 16) O = O.toUpperCase();
				} else if(radix == 8) {
					O = (Vnum>>>0).toString(8);
					O = (10 - O.length >= 0 ? padstr[ "0"].substr(0,10 - O.length) : "") + O;
					Vnum = Math.floor((Vnum - ((Vnum >>> 0)&0x3FFFFFFF)) / Math.pow(2,30));
					O = (Vnum>>>0).toString(8) + O.substr(O.length - 10);
					O = O.substr(O.length - 20);
					O = "1" + (21 - O.length >= 0 ? padstr[ "7"].substr(0,21 - O.length) : "") + O;
				} else {
					Vnum = (-Vnum) % 1e16;
					var d1 = [1,8,4,4,6,7,4,4,0,7,3,7,0,9,5,5,1,6,1,6];
					var di = d1.length - 1;
					while(Vnum > 0) {
						if((d1[di] -= (Vnum % 10)) < 0) { d1[di] += 10; d1[di-1]--; }
						--di; Vnum = Math.floor(Vnum / 10);
					}
					O = d1.join("");
				}
			} else {
				if(radix === -16) O = Vnum.toString(16).toLowerCase();
				else if(radix === 16) O = Vnum.toString(16).toUpperCase();
				else O = Vnum.toString(radix);
			}

			/* apply precision */
			if(prec ===0 && O == "0" && !(radix == 8 && alt)) O = ""; /* bail out */
			else {
				if(O.length < prec + (O.substr(0,1) == "-" ? 1 : 0)) {
					if(O.substr(0,1) != "-") O = (prec - O.length >= 0 ? padstr[ "0"].substr(0,prec - O.length) : "") + O;
					else O = O.substr(0,1) + (prec + 1 - O.length >= 0 ? padstr[ "0"].substr(0,prec + 1 - O.length) : "") + O.substr(1);
				}

				/* add prefix for # form */
				if(!sign && alt && Vnum !== 0) switch(radix) {
					case -16: O = "0x" + O; break;
					case  16: O = "0X" + O; break;
					case   8: if(O.charAt(0) != "0") O =  "0" + O; break;
					case   2: O = "0b" + O; break;
				}
			}

			/* add sign character */
			if(sign && O.charAt(0) != "-") {
				if(flags.indexOf("+") > -1) O = "+" + O;
				else if(flags.indexOf(" ") > -1) O = " " + O;
			}
			/* width */
			if(width > 0) {
				if(O.length < width) {
					if(flags.indexOf("-") > -1) {
						O = O + ((width - O.length) >= 0 ? padstr[ " "].substr(0,(width - O.length)) : "");
					} else if(flags.indexOf("0") > -1 && prec < 0 && O.length > 0) {
						if(prec > O.length) O = ((prec - O.length) >= 0 ? padstr[ "0"].substr(0,(prec - O.length)) : "") + O;
						pad = ((width - O.length) >= 0 ? padstr[ (prec > 0 ? " " : "0")].substr(0,(width - O.length)) : "");
						if(O.charCodeAt(0) < 48) {
							if(O.charAt(2).toLowerCase() == "x") O = O.substr(0,3) + pad + O.substring(3);
							else O = O.substr(0,1) + pad + O.substring(1);
						}
						else if(O.charAt(1).toLowerCase() == "x") O = O.substr(0,2) + pad + O.substring(2);
						else O = pad + O;
					} else {
						O = ((width - O.length) >= 0 ? padstr[ " "].substr(0,(width - O.length)) : "") + O;
					}
				}
			}

		} else if(isnum > 0) {

			Vnum = Number(arg);
			if(arg === null) Vnum = 0/0;
			if(len == "L") bytes = 12;
			var isf = isFinite(Vnum);
			if(!isf) { /* Infinity or NaN */
				if(Vnum < 0) O = "-";
				else if(flags.indexOf("+") > -1) O = "+";
				else if(flags.indexOf(" ") > -1) O = " ";
				O += (isNaN(Vnum)) ? "nan" : "inf";
			} else {
				var E = 0;

				if(prec == -1 && isnum != 4) prec = 6;

				/* g/G conditional behavior */
				if(isnum == 3) {
					O = Vnum.toExponential(1);
					E = +O.substr(O.indexOf("e") + 1);
					if(prec === 0) prec = 1;
					if(prec > E && E >= -4) { isnum = (11); prec = prec -(E + 1); }
					else { isnum = (12); prec = prec - 1; }
				}

				/* sign: workaround for negative zero */
				var sg = (Vnum < 0 || 1/Vnum == -Infinity) ? "-" : "";
				if(Vnum < 0) Vnum = -Vnum;

				switch(isnum) {
					/* f/F standard */
					case 1: case 11:
						if(Vnum < 1e21) {
							O = Vnum.toFixed(prec);
							if(isnum == 1) { if(prec===0 &&alt&& O.indexOf(".")==-1) O+="."; }
							else if(!alt) O=O.replace(/(\.\d*[1-9])0*$/,"$1").replace(/\.0*$/,"");
							else if(O.indexOf(".") == -1) O+= ".";
							break;
						}
						O = Vnum.toExponential(20);
						E = +O.substr(O.indexOf("e")+1);
						O = O.charAt(0) + O.substr(2,O.indexOf("e")-2);
						O = O + (E - O.length + 1 >= 0 ? padstr[ "0"].substr(0,E - O.length + 1) : "");
						if(alt || (prec > 0 && isnum !== 11)) O = O + "." + (prec >= 0 ? padstr[ "0"].substr(0,prec) : "");
						break;

					/* e/E exponential */
					case 2: case 12:
						O = Vnum.toExponential(prec);
						E = O.indexOf("e");
						if(O.length - E === 3) O = O.substr(0, E+2) + "0" + O.substr(E+2);
						if(alt && O.indexOf(".") == -1) O = O.substr(0,E) +"."+ O.substr(E);
						else if(!alt && isnum == 12) O = O.replace(/\.0*e/, "e").replace(/\.(\d*[1-9])0*e/, ".$1e");
						break;

					/* a/A hex */
					case 4:
						if(Vnum===0){O= "0x0"+((alt||prec>0)?"."+(prec >= 0 ? padstr["0"].substr(0,prec) : ""):"")+"p+0"; break;}
						O = Vnum.toString(16);
						/* First char 0-9 */
						var ac = O.charCodeAt(0);
						if(ac == 48) {
							ac = 2; E = -4; Vnum *= 16;
							while(O.charCodeAt(ac++) == 48) { E -= 4; Vnum *= 16; }
							O = Vnum.toString(16);
							ac = O.charCodeAt(0);
						}

						var ai = O.indexOf(".");
						if(O.indexOf("(") > -1) {
							/* IE exponential form */
							var am = O.match(/\(e(.*)\)/);
							var ae = am ? (+am[1]) : 0;
							E += 4 * ae; Vnum /= Math.pow(16, ae);
						} else if(ai > 1) {
							E += 4 * (ai - 1); Vnum /= Math.pow(16, ai - 1);
						} else if(ai == -1) {
							E += 4 * (O.length - 1); Vnum /= Math.pow(16, O.length - 1);
						}

						/* at this point 1 <= Vnum < 16 */

						if(bytes > 8) {
							if(ac < 50) { E -= 3; Vnum *= 8; }
							else if(ac < 52) { E -= 2; Vnum *= 4; }
							else if(ac < 56) { E -= 1; Vnum *= 2; }
							/* at this point 8 <= Vnum < 16 */
						} else {
							if(ac >= 56) { E += 3; Vnum /= 8; }
							else if(ac >= 52) { E += 2; Vnum /= 4; }
							else if(ac >= 50) { E += 1; Vnum /= 2; }
							/* at this point 1 <= Vnum < 2 */
						}

						O = Vnum.toString(16);
						if(O.length > 1) {
							if(O.length > prec+2 && O.charCodeAt(prec+2) >= 56) {
								var _f = O.charCodeAt(0) == 102;
								O = (Vnum + 8 * Math.pow(16, -prec-1)).toString(16);
								if(_f && O.charCodeAt(0) == 49) E += 4;
							}
							if(prec > 0) {
								O = O.substr(0, prec + 2);
								if(O.length < prec + 2) {
									if(O.charCodeAt(0) < 48) O = O.charAt(0) + ((prec + 2 - O.length) >= 0 ? padstr[ "0"].substr(0,(prec + 2 - O.length)) : "") + O.substr(1);
									else O += ((prec + 2 - O.length) >= 0 ? padstr[ "0"].substr(0,(prec + 2 - O.length)) : "");
								}
							} else if(prec === 0) O = O.charAt(0) + (alt ? "." : "");
						} else if(prec > 0) O = O + "." + (prec >= 0 ? padstr["0"].substr(0,prec) : "");
						else if(alt) O = O + ".";
						O = "0x" + O + "p" + (E>=0 ? "+" + E : E);
						break;
				}

				if(sg === "") {
					if(flags.indexOf("+") > -1) sg = "+";
					else if(flags.indexOf(" ") > -1) sg = " ";
				}

				O = sg + O;
			}

			/* width */
			if(width > O.length) {
				if(flags.indexOf("-") > -1) {
					O = O + ((width - O.length) >= 0 ? padstr[ " "].substr(0,(width - O.length)) : "");
				} else if(flags.indexOf("0") > -1 && O.length > 0 && isf) {
					pad = ((width - O.length) >= 0 ? padstr[ "0"].substr(0,(width - O.length)) : "");
					if(O.charCodeAt(0) < 48) {
						if(O.charAt(2).toLowerCase() == "x") O = O.substr(0,3) + pad + O.substring(3);
						else O = O.substr(0,1) + pad + O.substring(1);
					}
					else if(O.charAt(1).toLowerCase() == "x") O = O.substr(0,2) + pad + O.substring(2);
					else O = pad + O;
				} else {
					O = ((width - O.length) >= 0 ? padstr[ " "].substr(0,(width - O.length)) : "") + O;
				}
			}
			if(c < 96) O = O.toUpperCase();

		}

		o.push(O);
	}
	return o.join("");
}

function vsprintf(fmt, args) { return doit(tokenize(fmt), args); }

function sprintf() {
	var args = new Array(arguments.length - 1);
	for(var i = 0; i < args.length; ++i) args[i] = arguments[i+1];
	return doit(tokenize(arguments[0]), args);
}

PRINTJ.sprintf = sprintf;
PRINTJ.vsprintf = vsprintf;
PRINTJ._doit = doit;
PRINTJ._tokenize = tokenize;

}));

