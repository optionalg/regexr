/*
 The MIT License (MIT)

 Copyright (c) 2014 gskinner.com, inc.

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

var RegExLexer = function () { };
var p = RegExLexer.prototype;

// TODO: all these constants should move into a core profile:
// \ ^ $ . | ? * + ( ) [ {
RegExLexer.CHAR_TYPES = {
	".": "dot",
	"|": "alt",
	"$": "eof", // TODO: rename?
	"^": "bof",
	"?": "opt", // also: "lazy"
	"+": "plus",
	"*": "star"
};

RegExLexer.ESC_CHARS_SPECIAL = {
	"w": "word",
	"W": "notword",
	"d": "digit",
	"D": "notdigit",
	"s": "whitespace",
	"S": "notwhitespace",
	"b": "wordboundary",
	"B": "notwordboundary"
	// u-uni, c-ctrl, x-hex, oct handled in parseBackSlash
};

RegExLexer.PCRE_ESC_CHARS_SPECIAL = {
	"G": "prevmatchend",
	"A": "bos",
	"Z": "eos",
	"z": "abseos",
	"K": "keep",
	"h": "hwhitespace",
	"H": "nothwhitespace",
	"N": "notlinebreak",
	"X": "unicodegrapheme"
};

RegExLexer.UNQUANTIFIABLE = {
	"quant": true,
	"plus": true,
	"star": true,
	"opt": true,
	"eof": true,
	"bof": true,
	"group": true, // group open
	"lookaround": true, // lookaround open
	"wordboundary": true,
	"notwordboundary": true,
	"lazy": true,
	"alt": true,
	"open": true,
	"condition": true,
	"condition_close": true,
	"conditional": true, // conditional open
	"mode": true
};

RegExLexer.ESC_CHAR_CODES = {
	"0": 0,  // null
	"t": 9,  // tab
	"n": 10, // lf
	"v": 11, // vertical tab
	"f": 12, // form feed
	"r": 13  // cr
};

RegExLexer.PCRE_ESC_CHAR_CODES = {
	"a": 7,
	"e": 27
};

RegExLexer.UNICODE_SCRIPTS = {
	"Cherokee": true,
	"Common": true
};

RegExLexer.UNICODE_CATEGORIES = {
	"Ll": true,
	"L": true
};



p.string = null;
p.token = null;
p.errors = null;
p.captureGroups = null;
p.namedGroups = null;
p.pcreMode = true;

p.parse = function (str) {
	if (str === this.string) {
		return this.token;
	}

	this.token = null;
	this.string = str;
	this.errors = [];
	var capgroups = this.captureGroups = [];
	var namedgroups = this.namedGroups = {};
	var groups = [], refs = [], i = 0, l = str.length;
	var o, c, token, prev = null, charset = null, unquantifiable = RegExLexer.UNQUANTIFIABLE;
	var charTypes = RegExLexer.CHAR_TYPES;
	var closeIndex = str.lastIndexOf("/");

	while (i < l) {
		c = str[i];

		token = {i: i, l: 1, prev: prev};

		if (i === 0 || i >= closeIndex) {
			this.parseFlag(str, token);
		} else if (c === "(" && !charset) {
			this.parseParen(str, token);
			if (token.close === null) {
				token.depth = groups.length;
				groups.push(token);
			}
			if (token.capture) {
				capgroups.push(token);
				if (token.name && isNaN(token.name)) { namedgroups[token.name] = token; }
				token.num = capgroups.length;
			}
		} else if (c === ")" && !charset) {
			token.type = "groupclose";
			if (groups.length) {
				o = token.open = groups.pop();
				o.close = token;
			} else {
				token.err = "groupclose";
			}
		} else if (c === "[" && !charset) {
			token.type = token.clss = "set";
			charset = token;
			if (str[i + 1] === "^") {
				token.l++;
				token.type += "not";
			}
		} else if (c === "]" && charset) {
			token.type = "setclose";
			token.open = charset;
			charset.close = token;
			charset = null;
		} else if (c === "+" && prev && prev.clss === "quant" && this.pcreMode) {
			token.type = "possessive";
			token.related = [prev];
		} else if ((c === "+" || c === "*") && !charset) {
			token.type = charTypes[c];
			token.clss = "quant";
			token.min = (c === "+" ? 1 : 0);
			token.max = -1;
		} else if (c === "{" && !charset && str.substr(i).search(/^{\d+,?\d*}/) !== -1) {
			this.parseQuant(str, token);
		} else if (c === "\\") {
			this.parseBackSlash(str, token, charset, closeIndex);
		} else if (c === "?" && !charset) {
			if (!prev || prev.clss !== "quant") {
				token.type = charTypes[c];
				token.clss = "quant";
				token.min = 0;
				token.max = 1;
			} else {
				token.type = "lazy";
				token.related = [prev];
			}
		} else if (c === "-" && charset && prev.code !== undefined && prev.prev && prev.prev.type !== "range") { // TODO: !== ?
			// this may be the start of a range, but we'll need to validate after the next token.
			token.type = "range";
		} else {
			this.parseChar(str, token, charset);
		}

		if (prev) {
			prev.next = token;
		}

		// post processing:
		var curGroup = groups.length ? groups[groups.length-1] : null;
		if (token.clss === "quant") {
			if (!prev || unquantifiable[prev.type] || (prev.open && unquantifiable[prev.open.type+"_close"])) {
				token.err = "quanttarg";
			}
			else {
				token.related = [prev.open || prev];
			}
		}
		if (token.group === true) {
			refs.push(token);
		}
		if (curGroup && curGroup.type === "conditional" && token.type === "alt") {
			if (!curGroup.alt) { curGroup.alt = token; }
			else { token.err = "extraelse"; }
			token.related = [curGroup];
			token.type = "conditionalelse";
			token.clss = "special";
		}
		if (prev && prev.type === "range" && prev.l === 1) {
			token = this.validateRange(str, prev);
		}
		if (token.open && !token.clss) {
			token.clss = token.open.clss;
		}

		if (!this.token) {
			this.token = token;
		}
		// TODO: is setting token.end necessary? Complicates post-processing.
		i = token.end = token.i + token.l;
		if (token.err) {
			this.errors.push(token.err);
		}
		prev = token;
	}


	while (groups.length) {
		this.errors.push(groups.pop().err = "groupopen");
	}
	this.matchRefs(refs, capgroups, namedgroups);
	if (charset) {
		this.errors.push(charset.err = "setopen");
	}

	// TODO: TMP
	this.errors.length = 0;
	return this.token;
};

p.getRef = function(token, str) {
	token.clss = "ref";
	token.group = true;
	token.relIndex = this.captureGroups.length;
	token.name = str;
};

p.matchRefs = function(refs, indexes, names) {
	while (refs.length) {
		var token = refs.pop(), name=token.name, group = names[name];

		if (!group && !isNaN(name)) {
			var sign = name[0], index = parseInt(name) + ((sign === "+" || sign === "-") ? token.relIndex : 0);
			if (sign === "-") { index++; }
			group = indexes[index-1];
		}
		if (group) {
			token.group = group;
			token.related = [group];
			token.dir = (token.i < group.i) ? 1 : (!group.close || token.i < group.close.i) ? 0 : -1;
		} else {
			if (this.refToOctal(token)) { continue; }
			this.errors.push(token.err = "unmatchedref");
		}
	}
};

p.refToOctal = function(token) {
	// PCRE: \# \0 = unmatched, \00 = octal, \## = dunno?
	// JS: \# = unmatched?, \0 \00 = octal, \## = dunno
	if (token.type !== "reference") { return false; } // simple \13 style
	var name = token.name;
	if (/^[0-7]{2}$/.test(name)) { // octal
		var next = token.next, char = String.fromCharCode(next.code);
		if (next.type === "char" && char >= "0" && char <= "7" && parseInt(name+char, 8) <= 255) {
			name += char;
			this.mergeNext(token);
		}
	} else if (this.pcreMode || !/^[0-7]$/.test(name)) {
		return false;
	}
	token.code = parseInt(name,8);
	token.clss = "esc";
	token.type = "escoctal";
	delete token.name;
	return true;
};

p.mergeNext = function(token) {
	var next = token.next;
	token.next = next.next;
	token.next.prev = token;
	token.l++;
	if (token.end !== undefined) { token.end++; }
};

p.parseFlag = function (str, token) {
	// note that this doesn't deal with misformed patterns or incorrect flags.
	var i = token.i, c = str[i];
	if (str[i] === "/") {
		token.type = (i === 0) ? "open" : "close";
		if (i !== 0) {
			token.related = [this.token];
			this.token.related = [token];
		}
	} else {
		token.type = "flag_" + c;
	}
	token.clear = true;
};

p.parseChar = function (str, token, charset) {
	var c = str[token.i];
	token.type = (!charset && RegExLexer.CHAR_TYPES[c]) || "char";
	if (!charset && c === "/") {
		token.err = "fwdslash";
	}
	if (token.type === "char") {
		token.code = c.charCodeAt(0);
	} else if (token.type === "bof" || token.type === "eof") {
		token.clss = "anchor";
	} else if (token.type === "dot") {
		token.clss = "charclass";
	}
	return token;
};

p.parseParen = function (str, token) {
	// TODO: will need to "post-link" references, conditionals, etc since forward references are allowed
	/*
	core:
.		capgroup
.		lookahead: ?= ?!
.		noncap: ?:
	PCRE:
.		lookbehind: ?<= ?<!
.		named: ?P<name> ?'name' ?<name>
.		namedref: ?P=name		Also: \g'name' \k'name' etc
.		comment: ?#
.		atomic: ?>
.		recursion: ?0 ?R		Also: \g<0>
.		define: ?(DEFINE)
.		subroutine: ?1 ?-1 ?&name ?P>name
		conditionalgroup: ?(1)a|b ?(-1)a|b ?(name)a|b
		conditional: ?(?=if)then|else
		mode: ?c-i
	*/

	token.clss = token.type = "group";
	if (str[token.i+1] !== "?") {
		token.close = null; // indicates that it needs a close token.
		token.capture = true;
		return token;
	}

	var sub = str.substr(token.i+2), match, s=sub[0];

	if (s === ":") {
		token.type = "noncapgroup";
		token.close = null;
		token.l = 3;
	} else if (s === ">") {
		token.type = "atomic";
		token.close = null;
		token.l = 3;
	} else if (s === "#" && (match = sub.match(/[^)]*\)/))) {
		token.clss = token.type = "comment";
		token.l = 2+match[0].length;
	} else if (/^(R|0)\)/.test(sub)) {
		token.clss = "ref";
		token.type = "recursion";
		token.l = 4;
	} else if (match = sub.match(/^P=(\w+)\)/i)) {
		token.type = "namedref";
		this.getRef(token, match[1]);
		token.l = match[0].length+2;
	} else if (/^\(DEFINE\)/.test(sub)) {
		token.type = "define";
		token.close = null;
		token.l = 10;
	} else if (match = sub.match(/^<?[=!]/)) {
		var isCond = token.prev.type === "conditional";
		token.clss = isCond ? "special" : "lookaround";
		token.close = null;
		s = match[0];
		token.behind = s[0] === "<";
		token.negative = s[+token.behind] === "!";
		token.type = isCond ? "condition" : (token.negative ? "neg" : "pos") + "look" + (token.behind ? "behind" : "ahead");
		if (isCond) {
			// TODO: this doesn't highlight correctly yet:
			token.proxy = token.prev;
			token.prev.related = [token];
			token.prev.condition = token;
		}
		token.l = s.length + 2;
	} else if ((match = sub.match(/^'(\w+)'/)) || (match = sub.match(/^P?<(\w+)>/))) {
		token.type = "namedgroup";
		token.close = null;
		token.name = match[1];
		token.capture = true;
		token.l = match[0].length + 2;
	} else if ((match = sub.match(/^([-+]?\d\d?)\)/)) || (match = sub.match(/^(?:&|P>)(\w+)\)/))) {
		token.type = "subroutine";
		this.getRef(token, match[1]);
		token.l = match[0].length + 2;
	} else if (false && (match = sub.match(/^\(([-+]?\d\d?)\)/)) || (match = sub.match(/^\((\w+)\)/))) {
		token.clss = "special";
		token.type = "conditionalgroup";
		token.close = null;
		token.name = match[1];
		token.l = match[0].length + 2;
	} else if (/^\(\?<?[=!]/.test(sub)) {
		token.clss = "special";
		token.type = "conditional";
		token.close = null;
		token.l = 2;
	} else if (match = sub.match(/^[-ixsmJU]+\)/)) {
		// supported modes in PCRE: i-caseinsens, x-freespacing, s-dotall, m-multiline, J-samename, U-switchlazy
		// TODO: in the future, we could potentially support x, s, U  modes correctly in the lexer
		token.clss = "special";
		token.type = "mode";
		token.l = match[0].length + 2;
	} else {
		// error, found a (? without matching anything. Treat it as a normal group and let it error out.
		token.close = null;
		token.capture = true;
	}

	// TODO: should this just be global?
	//token.supported = this.profile[token.type] !== 0;

	return token;
};

p.parseBackSlash = function (str, token, charset, closeIndex) {
	// jsMode tries to read escape chars as a JS string which is less permissive than JS RegExp, and doesn't support \c or backreferences, used for subst

	// Note: \8 & \9 are treated differently: IE & Chrome match "8", Safari & FF match "\8", we support the former case since Chrome & IE are dominant
	// Note: Chrome does weird things with \x & \u depending on a number of factors, we ignore this.
	var i = token.i, jsMode = token.js, match;
	var sub = str.substr(i + 1), c = sub[0];
	if (i + 1 === (closeIndex || str.length)) {
		token.err = "esccharopen";
		return;
	}

	// TODO: update jsMode
	if (!jsMode && !charset && (match = sub.match(/^\d\d?/))) {
		// basic reference: \1 \22
		// we will write this as a reference for now, and re-write it later if it doesn't match a group
		token.type = "reference";
		this.getRef(token, match[0]);
		token.l += match[0].length;
		return token;
	}
	if (!jsMode && this.pcreMode && !charset && (c === "g" || c === "k")) {
		return this.parseRef(token, sub);
	}

	if (this.pcreMode && (c === "p" || c === "P")) {
		// unicode: \p{Ll}
		return this.parseUnicode(token, sub);
	} else if (this.pcreMode && c === "Q") {
		// escsequence: \Q...\E
		token.type = "escsequence";
		if ((i = sub.indexOf("\\E")) !== -1) { token.l += i+2; }
		else { token.l += closeIndex-token.i-1; }
		console.log(i);
	} else if (!this.pcreMode && (match = sub.match(/^u([\da-fA-F]{4})/))) {
		// unicode: \uFFFF
		token.type = "escunicode";
		token.l += match[0].length;
		token.code = parseInt(match[1], 16);
	} else if (this.pcreMode && (match = sub.match(/^x\{([\da-fA-F]+)}/))) {
		// unicode: \x{FFFF}
		token.type = "escunicodex";
		token.l += match[0].length;
		token.code = parseInt(match[1], 16);
	} else if (match = sub.match(/^x([\da-fA-F]{0,2})/)) {
		// hex ascii: \xFF
		token.type = "eschexadecimal";
		token.l += match[0].length;
		token.code = parseInt(match[1]||0, 16);
	} else if (!jsMode && (match = sub.match(/^c[a-zA-Z]/))) {
		// control char: \cA \cz
		// not supported in JS strings
		sub = match[0].substr(1);
		token.type = "esccontrolchar";
		token.l += 2;
		var code = sub.toUpperCase().charCodeAt(0) - 64; // A=65
		if (code > 0) {
			token.code = code;
		}
	} else if (match = sub.match(/^[0-7]{1,3}/)) {
		// octal ascii: \011
		sub = match[0];
		if (parseInt(sub, 8) > 255) {
			sub = sub.substr(0, 2);
		}
		token.type = "escoctal";
		token.l += sub.length;
		token.code = parseInt(sub, 8);
	} else if (!jsMode && c == "c") {
		// control char without a code - strangely, this is decomposed into literals equivalent to "\\c"
		return this.parseChar(str, token, charset); // this builds the "/" token
	} else {
		// single char
		token.l++;
		if (jsMode && (c === "x" || c === "u")) {
			token.err = "esccharbad";
		}
		if (!jsMode) {
			token.type = RegExLexer.ESC_CHARS_SPECIAL[c];
			if (!token.type && this.pcreMode) {
				token.type = RegExLexer.PCRE_ESC_CHARS_SPECIAL[c];
			}
		}

		if (token.type) {
			token.clss = (c.toLowerCase() === "b") ? "anchor" : "charclass";
			return token;
		}
		token.type = "escchar";
		token.code = RegExLexer.ESC_CHAR_CODES[c];
		if (token.code === undefined && this.pcreMode) {
			token.code = RegExLexer.PCRE_ESC_CHAR_CODES[c];
		}
		if (token.code === undefined) {
			token.code = c.charCodeAt(0);
		}
	}
	token.clss = "esc";
	return token;
};

p.parseRef = function(token, sub) {
	// named reference: \k<name> \k'name' \k{name} \g{name}
	// named subroutines: \g<name> \g'name'
	// num references: \g1 \g+2 \g{2}
	// num subroutines: \g<-1> \g'1'
	var c=sub[0], s="";
	if (match = sub.match(/^[gk](?:'\w*'|<\w*>|{\w*})/)) {
		s = match[0].substr(2, match[0].length - 3);
		if (c === "k" && !isNaN(s)) { s = ""; } // TODO: specific error?
	} else if (match = sub.match(/^g(?:({[-+]?\d+}|<[-+]?\d+>|'[-+]?\d+')|([-+]?\d+))/)) {
		s = match[2] !== undefined ? match[2] : match[1].substr(1, match[1].length-2);
	}
	var isRef = c === "k" || !(sub[1] === "'" || sub[1] === "<");
	token.type = (isNaN(s) ? "named" : "num") + (isRef ? "ref" : "subroutine");
	this.getRef(token, s);
	token.l += match ? match[0].length : 1;
}

p.parseUnicode = function(token, sub) {
	// unicodescript: \p{Cherokee}
	// unicodecat: \p{Ll} \pL
	// negated: \P{Ll} \p{^Lu}
	var match = sub.match(/p\{(\w*)}/i), val = match && match[1];
	if (!match && (match = sub.match(/p([LMZSNPC])/))) { val = match[1]; }
	token.l += match ? match[0].length : 1;
	token.type = "unicodecat";
	if (RegExLexer.UNICODE_SCRIPTS[val]) {
		token.type = "unicodescript";
	} else if (!RegExLexer.UNICODE_CATEGORIES[val]) {
		val = null;
	}
	if (!val) { token.err = "unmatchedunicode"; }
	token.unicodeid = val;
	token.type = (sub[0] === "P" ? "not" : "") + token.type; // TODO: expand further?
	return token;
};

p.parseQuant = function (str, token) {
	// quantifier: {0,3} {3} {1,}
	token.type = token.clss = "quant";
	var i = token.i;
	var end = str.indexOf("}", i + 1);
	token.l += end - i;
	var arr = str.substring(i + 1, end).split(",");
	token.min = parseInt(arr[0]);
	token.max = (arr[1] === undefined) ? token.min : (arr[1] === "") ? -1 : parseInt(arr[1]); // TODO: === ?
	if (token.max !== -1 && token.min > token.max) {
		token.err = "quantrev";
	}
	return token;
};

p.validateRange = function (str, token) {
	var prev = token.prev, next = token.next;
	if (prev.code === undefined || next.code === undefined) { // TODO: === ?
		// not a range, rewrite as a char:
		this.parseChar(str, token);
	} else {
		token.clss = "set";
		if (prev.code > next.code) {
			token.err = "rangerev";
		}
		// preserve as separate tokens, but treat as one in the UI:
		next.proxy = prev.proxy = token;
		token.set = [prev, token, next];
	}
	return next;
};

module.exports = RegExLexer;
