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
The core profile essentially defines every feature we support, and is then pared down by other profiles.

It also acts in part as pseudo documentation.
 */

var y=true, n=false;

profiles.core = {
	flags: {
		"g": "global", // note that this is not a real flag in some flavors, but a different method call
		"i": "caseinsensitive",
		"m": "multiline",
		"s": "dotall",
		"u": "unicode",
		"y": "sticky"
	},
	
	escape: "[\\^$.|?*+()/",
	
	escCharCodes: {
		"0": 0,  // null
		"a": 7,  // bell
		"t": 9,  // tab
		"n": 10, // lf
		"v": 11, // vertical tab
		"f": 12, // form feed
		"r": 13, // cr
		"e": 27  // escape
	},
	
	specialChars: {
		".": "dot",
		"|": "alt",
		"$": "eof",  // TODO: rename?
		"^": "bof",
		"?": "opt",  // also: "lazy"
		"+": "plus", // also: "possessive"
		"*": "star"
	},
	
	escCharSpecials: {
		"A": "bos",
		"b": "wordboundary",
		"B": "notwordboundary",
		"d": "digit",
		"D": "notdigit",
		"G": "prevmatchend",
		"h": "hwhitespace",
		"H": "nothwhitespace",
		"K": "keep",
		"N": "notlinebreak",
		"s": "whitespace",
		"S": "notwhitespace",
		"w": "word",
		"W": "notword",
		"X": "unicodegrapheme",
		"Z": "eos",
		"z": "abseos"
	},
	
	unicodeScripts: {
		"Common": y,
		"Cherokee": y
	},
	
	unicodeCategories: {
		"Ll": y,
		"L": y
		// alias syntax: "Lowercase_Letter": "Ll"
	},
	
	modes: {
		"i": "caseinsens",
		"x": "freespacing",
		"s": "dotall",
		"m": "multiline",
		"J": "samename",
		"U": "switchlazy"
	},
	
	tokens: {
		// note that not all of these are actively used in the lexer, but are included for completeness.
		"open": y, // opening /
		"close": y, // closing /
		"char": y, // abc
		
		// classes:
		// also in escCharSpecials and specialChars
		"set": y, // [a-z]
		"setnot": y, // [^a-z]
		"setClose": y, // ]
		"range": y, // [a-z]
		"unicodecat": y, // \p{Ll} \P{^Ll} \pL
		"notunicodecat": y, // \P{Ll} \p{^Ll} \PL
		"unicodescript": y, // \p{Cherokee} \P{^Cherokee}
		"notunicodescript": y, // \P{Cherokee} \p{^Cherokee}
		// not in supported flavors:	"unicodeblock": y, // \p{InThai} \p{IsThai} and NOT \P
		// not in supported flavors:	"subtract": y, // [base-[subtract]]
		// not in supported flavors:	"intersect": y, // [base&&[intersect]]
		
		// esc:
		// also in escCharCodes and escCharSpecials
		"escoctal": y, // \11
		"escunicode": y, // \uFFFF
		"escunicodeu": y, // \u{00A9} // TODO: not in PCRE. In JS behind unicode flag. Needs lexer support.
		"escunicodex": y, // \x{00A9}
		"escsequence": y, // \Q...\E
		"eschexadecimal": y, // \xFF
		"esccontrolchar": y, // \cA
		"escchar": y, // escCharCodes
		// not in supported flavors:	"escoctalo": y, // \o{377}, PCRE 8.34+

		
		// group:
		"group": y, // (foo)
		"groupclose": y, // )
		"noncapgroup": y, // (?:foo)
		"namedgroup": y, // (?P<name>foo) (?<name>foo) (?'name'foo)
		"atomic": y, // (?>foo|bar)
		"define": y, // (?(DEFINE)foo)
		
		
		// lookaround:
		"poslookbehind" : y,
		"neglookbehind": y,
		"poslookahead": y,
		"neglookahead": y,
		
		// ref:
		"reference": y, // simple \1
		"namedref": y, // \k<name> \k'name' \k{name} (?P=name)  \g{name}
		"numref": y, // \g{-1} \g{+1} \g{1} \g1 \g-1
		"recursion": y, // (?R) (?0) \g<0> \g'0'
		"subroutine": y, // (?1) (?-1) (?&name) (?P>name)
		"numsubroutine": y, // \g<-1> \g'-1' 
		"namedsubroutine": y, // \g<name> \g'name'
		
		// quantifiers:
		// also in specialChars
		"possessive": y,
		"lazy": y,
		
		// special:
		"conditional": y, // (?(?=if)then|else)
		"conditionalif": y, // (?=if)
		"conditionalelse": y, // |
		"conditionalgroup": y, // (?(1)a|b) (?(-1)a|b) (?(name)a|b)
		"mode": y, // (?i-x) see modes above
		"comment": y, // (?#comment)
	},
	
	config: {
		forwardref: y, // \1(a)
		nestedref: y, // (\1a|b)+
		ctrlcodeerr: y // does \c error, or decompose?
	},
	
	substTokens: {
		// TODO: fill this in.
		// TODO: not implemented in subst lexer:
		subst_case: 0, // \U \L \u \l \E
		subst_conditional: 0 // ${1:+then:else} ${1:-else} ${name:+then:else}
	},
	/*
	// for example:
	docs: {
		possessive: "+	This will be appended to the existing entry.",
		namedgroup: "This will overwrite the existing entry."
	}
	*/
};
})();


/*
classes:
quant
special
ref
esc
anchor
charclass
group
esccharbad


errors:
groupopen
setopen
quanttarg
extraelse
unmatchedref
fwdslash
 */
