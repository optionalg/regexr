/*
The MIT License (MIT)

Copyright (c) 2017 gskinner.com, inc.

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

(function() {
/*
The javascript profile disables a large number of features.
 */

function testFlag(flag) { try { return new RegExp(".",flag).test("a") * 1; } catch (e) { return 0; } }
var unicodeFlag = testFlag("u");
var stickyFlag = testFlag("y");
var y=true, n=false;

profiles.javascript = {
	flags: {
		"s": n,
		"u": unicodeFlag,
		"y": stickyFlag
	},

	escCharCodes: {
		"a": n,  // bell
		"e": n   // escape
	},

	escCharSpecials: {
		"A": n,
		"G": n,
		"h": n,
		"H": n,
		"K": n,
		"N": n,
		"X": n,
		"Z": n,
		"z": n
	},

	unicodeScripts: n,

	unicodeCategories: n,

	modes: n,

	tokens: {
		// classes:
		// also in escCharSpecials and specialChars
		"unicodecat": n, // \p{Ll} \P{^Ll} \pL
		"notunicodecat": n, // \P{Ll} \p{^Ll} \PL
		"unicodescript": n, // \p{Cherokee} \P{^Cherokee}
		"notunicodescript": n, // \P{Cherokee} \p{^Cherokee}

		// esc:
		// also in escCharCodes and escCharSpecials
		"escunicodeu": y, // \u{00A9} only if the unicode flag is set
		"escunicodex": n, // \x{00A9}
		"escsequence": n, // \Q...\E

		// group:
		"namedgroup": n, // (?P<name>foo) (?<name>foo) (?'name'foo)
		"atomic": n, // (?>foo|bar)
		"define": n, // (?(DEFINE)foo)

		// ref:
		"namedref": n, // \k<name> \k'name' \k{name} (?P=name)  \g{name}
		"numref": n, // \g{-1} \g{+1} \g{1} \g1 \g-1
		"recursion": n, // (?R) (?0) \g<0> \g'0'
		"numsubroutine": n, // \g<-1> \g'-1'
		"namedsubroutine": n, // \g<name> \g'name'

		// quantifiers:
		// also in specialChars
		"possessive": n,

		// special:
		"conditional": n, // (?(?=if)then|else)
		"conditionalif": n, // (?=if)
		"conditionalelse": n, // |
		"conditionalgroup": n, // (?(1)a|b) (?(-1)a|b) (?(name)a|b)
		"mode": n, // (?i-x) see modes above
		"comment": n, // (?#comment)
	},

	config: {
		forwardref: n, // \1(a)
		nestedref: n, // (\1a|b)+
		ctrlcodeerr: n // does \c error, or decompose?
	}
};
})();
