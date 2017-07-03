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

p.string = null;
p.token = null;
p.errors = null;
p.captureGroups = null;
p.namedGroups = null;
p.profile = null;
p.flags = null;

p.parse = function (str) {
	if (!this.profile) { return null; }
	if (str === this.string) {
		return this.token;
	}

	this.token = null;
	this.flags = {};
	this.string = str;
	this.errors = [];
	var capgroups = this.captureGroups = [];
	var namedgroups = this.namedGroups = {};
	var groups = [], refs = [], i = 0, l = str.length;
	var o, c, token, prev = null, charset = null;
	var profile = this.profile, unquantifiable = profile.unquantifiable;
	var charTypes = profile.charTypes;
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
		} else if (c === "[") {
			charset = this.parseSquareBracket(str, token, charset);
		} else if (c === "]" && charset) {
			token.type = "setclose";
			token.open = charset;
			charset.close = token;
			charset = null;
		} else if (c === "+" && prev && prev.clss === "quant" && profile.tokens.possessive) {
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
		if (curGroup && (curGroup.type === "conditional" || curGroup.type === "conditionalgroup") && token.type === "alt") {
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
			delete token.group;
			delete token.relIndex;
			if (!this.refToOctal(token)) { this.errors.push(token.err = "unmatchedref"); }
		}
	}
};

p.refToOctal = function(token) {
	// PCRE: \# \0 = unmatched, \00 = octal, \## = dunno
	// JS: \# = unmatched?, \0 \00 = octal, \## = dunno
	// PCRE matches \8 \9 to "8" "9"
	// JS: \8 \9 match "8" "9" in IE & Chrome, and "\8" "\9" in Safari & FF. We support the former case since Chrome & IE are dominant.
	if (token.type !== "reference") { return false; } // simple \13 style
	var name = token.name;
	if (/^[0-7]{2}$/.test(name)) { // octal
		var next = token.next, char = String.fromCharCode(next.code);
		if (next.type === "char" && char >= "0" && char <= "7" && parseInt(name+char, 8) <= 255) {
			name += char;
			this.mergeNext(token);
		}
	} else if (name === "8" || name === "9") {
		token.type = "escchar";
		token.clss = "esc";
		token.code = name.charCodeAt(0);
		delete token.name;
		return true;
	} else if (!this.profile.config.reftooctalalways || !/^[0-7]$/.test(name)) {
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
		// TODO: probably use flag names instead of this?
		token.type = this.profile.flags[c]; // old: "flag_" + c;
	}
	token.clear = true;
};

p.parseChar = function (str, token, charset) {
	var c = str[token.i];
	token.type = (!charset && this.profile.charTypes[c]) || "char";
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

p.parseSquareBracket = function(str, token, charset) {
	var match;
	if (!charset) {
		// set [a-z] [aeiou]
		// setnot [^a-z]
		token.type = token.clss = "set";
		if (str[token.i + 1] === "^") {
			token.l++;
			token.type += "not";
		}
		charset = token;
	} else if (this.profile.tokens.posixcharclass && (match = str.substr(token.i).match(/^\[(:)(.*?)\1]/))) {
		// posixcharclass: [:alpha:]
		// posixcollseq: [.ch.]
		// currently neither flavor supports posixcollseq, but PCRE does flag as an error:
		token.l = match[0].length;
		token.value = match[2];
		if (match[1] === ":") {
			token.type = "posixcharclass";
			if (!this.profile.posixCharClasses[match[2]]) { token.err = "posixcharclassbad"; }
		} else {
			token.type = "posixcollseq";
			token.err = "notsupported";
		}
	}
	return charset;
};

p.parseParen = function (str, token) {
	/*
	core:
.		capgroup:
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
		// (?:foo)
		token.type = "noncapgroup";
		token.close = null;
		token.l = 3;
	} else if (s === ">") {
		// (?>foo)
		token.type = "atomic";
		token.close = null;
		token.l = 3;
	} else if (s === "#" && (match = sub.match(/[^)]*\)/))) {
		// (?#foo)
		token.clss = token.type = "comment";
		token.l = 2+match[0].length;
	} else if (/^(R|0)\)/.test(sub)) {
		// (?R) (?0)
		token.clss = "ref";
		token.type = "recursion";
		token.l = 4;
	} else if (match = sub.match(/^P=(\w+)\)/i)) {
		// (?P=name)
		token.type = "namedref";
		this.getRef(token, match[1]);
		token.l = match[0].length+2;
	} else if (/^\(DEFINE\)/.test(sub)) {
		// (?(DEFINE)foo)
		token.type = "define";
		token.close = null;
		token.l = 10;
	} else if (match = sub.match(/^<?[=!]/)) {
		// (?=foo) (?<!foo)
		var isCond = token.prev.type === "conditional";
		token.clss = isCond ? "special" : "lookaround";
		token.close = null;
		s = match[0];
		token.behind = s[0] === "<";
		token.negative = s[+token.behind] === "!";
		token.type = isCond ? "condition" : (token.negative ? "neg" : "pos") + "look" + (token.behind ? "behind" : "ahead");
		if (isCond) {
			token.proxy = token.prev;
			token.prev.related = [token];
			token.prev.condition = token;
		}
		token.l = s.length + 2;
	} else if ((match = sub.match(/^'(\w+)'/)) || (match = sub.match(/^P?<(\w+)>/))) {
		// (?'name'foo) (?P<name>foo) (?<name>foo)
		token.type = "namedgroup";
		token.close = null;
		token.name = match[1];
		token.capture = true;
		token.l = match[0].length + 2;
	} else if ((match = sub.match(/^([-+]?\d\d?)\)/)) || (match = sub.match(/^(?:&|P>)(\w+)\)/))) {
		// (?1) (?-1) (?&name) (?P>name)
		token.type = (isNaN(match[1]) ? "named" : "num") + "subroutine"; // TODO: move to getRef?
		this.getRef(token, match[1]);
		token.l = match[0].length + 2;
	} else if ((match = sub.match(/^\(([-+]?\d\d?)\)/)) || (match = sub.match(/^\((\w+)\)/))) {
		// (?(1)a|b) (?(-1)a|b) (?(name)a|b)
		// TODO: set related (needs to be handled like a reference), handle alternation as an else
		token.clss = "special";
		token.type = "conditionalgroup";
		token.close = null;
		token.name = match[1];
		token.l = match[0].length + 2;
	} else if (/^\(\?<?[=!]/.test(sub)) {
		// (?(?=if)then|else)
		token.clss = "special";
		token.type = "conditional";
		token.close = null;
		token.l = 2;
	} else if (match = sub.match(/^[-ixsmJU]+\)/)) {
		// (?i-x)
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

	if (!this.profile.tokens[token.type]) { token.err = "notsupported"; }

	return token;
};

p.parseBackSlash = function (str, token, charset, closeIndex) {
	// jsMode tries to read escape chars as a JS string which is less permissive than JS RegExp, and doesn't support \c or backreferences, used for subst
	// Note: Chrome does weird things with \x & \u depending on a number of factors, we ignore this.
	var i = token.i, jsMode = token.js, match, profile = this.profile;
	var sub = str.substr(i + 1), c = sub[0], val;
	if (i + 1 === (closeIndex || str.length)) {
		token.err = "esccharopen";
		return;
	}

	// TODO: update jsMode
	if (!jsMode && !charset && (match = sub.match(/^\d\d?/))) {
		// \1 to \99
		// write this as a reference for now, and re-write it later if it doesn't match a group
		token.type = "reference";
		this.getRef(token, match[0]);
		token.l += match[0].length;
		return token;
	}
	if (!jsMode && profile.tokens.namedref && !charset && (c === "g" || c === "k")) {
		return this.parseRef(token, sub);
	}

	if (profile.tokens.unicodecat && (c === "p" || c === "P")) {
		// unicode: \p{Ll} \pL
		return this.parseUnicode(token, sub);
	} else if (profile.tokens.escsequence && c === "Q") {
		// escsequence: \Q...\E
		token.type = "escsequence";
		if ((i = sub.indexOf("\\E")) !== -1) { token.l += i+2; }
		else { token.l += closeIndex-token.i-1; }
	} else if (profile.tokens.escunicode && (match = sub.match(/^u([\da-fA-F]{4})/))) {
		// unicode: \uFFFF
		token.type = "escunicode";
		token.l += match[0].length;
		token.code = parseInt(match[1], 16);
	} else if (profile.tokens.escunicodex && (match = sub.match(/^x\{(.*?)}/))) {
		// unicode: \x{FFFF}
		token.type = "escunicodex";
		token.l += match[0].length;
		val = parseInt(match[1], 16);
		// TODO: PCRE currently only likes 2 digits (<256). In theory it should allow 4?
		if (isNaN(val) || val > 255 || /[^\da-f]/i.test(match[1])) { token.err = "esccharbad"; }
		else { token.code = val; }
	} else if (match = sub.match(/^x([\da-fA-F]{0,2})/)) {
		// hex ascii: \xFF
		token.type = "eschexadecimal";
		token.l += match[0].length;
		token.code = parseInt(match[1]||0, 16);
	} else if (!jsMode && (match = sub.match(/^c([a-zA-Z])?/))) {
		// control char: \cA \cz
		// also handles: \c
		// not supported in JS strings
		token.type = "esccontrolchar";
		if (match[1]) {
			token.code = match[1].toUpperCase().charCodeAt(0) - 64; // A=65
			token.l += 2;
		} else if (profile.config.ctrlcodeerr) {
			token.l++;
			token.err = "esccharbad";
		} else {
			return this.parseChar(str, token, charset); // this builds the "/" token
		}
	} else if (match = sub.match(/^[0-7]{1,3}/)) {
		// octal ascii: \011
		token.type = "escoctal";
		sub = match[0];
		if (parseInt(sub, 8) > 255) {
			sub = sub.substr(0, 2);
		}
		token.l += sub.length;
		token.code = parseInt(sub, 8);
	} else if (!jsMode && profile.tokens.escoctalo && (match = sub.match(/^o\{(.*?)}/i))) {
		// \o{377}
		token.type = "escoctalo";
		token.l += match[0].length;
		val = parseInt(match[1], 8);
		if (isNaN(val) || val > 255 || /[^0-7]/.test(match[1])) { token.err = "esccharbad"; }
		else { token.code = val; }
	} else {
		// single char
		token.l++;
		if (jsMode && (c === "x" || c === "u")) {
			token.err = "esccharbad";
		}
		if (!jsMode) {
			token.type = profile.escCharTypes[c];
		}

		if (token.type) {
			// TODO: update this.
			token.clss = (c.toLowerCase() === "b") ? "anchor" : "charclass";
			return token;
		}
		token.type = "escchar";
		token.code = profile.escCharCodes[c];
		if (token.code === undefined || token.code === false) {
			token.code = c.charCodeAt(0);
		}
	}
	token.clss = "esc";
	return token;
};

p.parseRef = function(token, sub) {
	// namedref: \k<name> \k'name' \k{name} \g{name}
	// namedsubroutine: \g<name> \g'name'
	// numref: \g1 \g+2 \g{2} // TODO: separate into rel and abs?
	// numsubroutine: \g<-1> \g'1'
	// recursion: \g<0> \g'0' // TODO: add
	var c=sub[0], s="";
	if (match = sub.match(/^[gk](?:'\w*'|<\w*>|{\w*})/)) {
		s = match[0].substr(2, match[0].length - 3);
		if (c === "k" && !isNaN(s)) { s = ""; } // TODO: specific error for numeric \k?
	} else if (match = sub.match(/^g(?:({[-+]?\d+}|<[-+]?\d+>|'[-+]?\d+')|([-+]?\d+))/)) {
		s = match[2] !== undefined ? match[2] : match[1].substr(1, match[1].length-2);
	}
	var isRef = c === "k" || !(sub[1] === "'" || sub[1] === "<");
	token.type = (isNaN(s) ? "named" : "num") + (isRef ? "ref" : "subroutine");
	this.getRef(token, s);
	token.l += match ? match[0].length : 1;
};

p.parseUnicode = function(token, sub) {
	// unicodescript: \p{Cherokee}
	// unicodecat: \p{Ll} \pL
	// not: \P{Ll} \p{^Lu}
	var match = sub.match(/p\{\^?(\w*)}/i), val = match && match[1], not = sub[0] === "P";
	if (!match && (match = sub.match(/[pP]([LMZSNPC])/))) { val = match[1]; }
	else { not = not !== (sub[2] === "^"); }
	token.l += match ? match[0].length : 1;
	token.type = "unicodecat";
	if (this.profile.unicodeScripts[val]) {
		token.type = "unicodescript";
	} else if (!this.profile.unicodeCategories[val]) {
		val = null;
	}
	if (not) { token.type = "not"+token.type; }
	if (!val) { token.err = "unmatchedunicode"; }
	token.unicodeid = val;
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
	// char range: [a-z] [\11-\n]
	var prev = token.prev, next = token.next;
	if (prev.code === undefined || next.code === undefined) {
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
