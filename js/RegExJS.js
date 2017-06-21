var s = {};

s.JS = 0;
s.PCRE = 1;

var ServerModel = require('./net/ServerModel');
var Utils = require('./utils/Utils');

s.match = function (regex, str, type, callback) {
	var matches = [];
	var error = null;
	var match = null;
	var index = null;

	if (!regex) {
		callback(error, matches);
		return;
	}

	if (type == s.JS) {
		s._processJS(regex, str, callback);
	} else if (type == s.PCRE) {
		s._processPCRE(regex, str, callback);
	}
};

s._processPCRE = function(regex, str, callback) {
	var pattern = regex.pattern;
	var flags = regex.flags;
	var global = false;

	// wdg: For now just remove the g flag. Possibly change to pass a paramter.
	var gIndex = flags.indexOf("g");

	if (gIndex !== -1) {
		global = true;
		flags = flags.substr(0, gIndex)+flags.substr(gIndex+1);
	}

	var json = JSON.stringify({pattern: pattern, flags: flags, global: global, str: str});

	ServerModel.executeRegex(json).then(function(result) {
		var error = null;
		if (result == null) {
			error = "ERROR";
			result = [];
		}

		// Format results to match what the JS RegEx engine sends.
		var formattedResults = [];
		for (var i = 0; i < result.length; i++) {
			var val = result[i];
			var row = [];
			formattedResults.push(row);
			for (var n in val) {
				if (!isNaN(n)) {
					row.push(val[n]);
				} else {
					row[n] = val[n];
				}
			}
		}

		callback(error, formattedResults);
	}).catch((err) => {
		callback(err || "ERROR", []);
	});
}

s._processJS = function (regex, str, callback) {
	if (window.Worker) {
		if (s.worker) {
			clearTimeout(s.id);
			s.worker.terminate();
		}

		s.worker = new Worker("js/regExWorker.template.js");

		s.worker.onmessage = function (evt) {
			// When the worker says its loaded start a timer. (For IE 10);
			if (evt.data == "onload") {
				s.id = setTimeout(function () {
					callback("timeout", matches);
					s.worker.terminate();
				}, 250);
			} else {
				matches = evt.data.matches;
				error = evt.data.error;
				clearTimeout(s.id);
				callback(error, matches);
			}
		}
		s.worker.postMessage({regex: regex, str: str});
	} else {
		while (!error) {
			match = regex.exec(str);
			if (!match) {
				break;
			}
			if (regex.global && index === regex.lastIndex) {
				error = "infinite";
				break;
			}
			match.num = matches.length;
			match.end = (index = match.index + match[0].length) - 1;
			match.input = null;
			matches.push(match);
			if (!regex.global) {
				break;
			} // or it will become infinite.
		}
		callback(error, matches);
	}
}

module.exports = s;
