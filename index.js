const debug = require('debug')('angular-expander')
var vm = require('vm');
var request = require('request');
var cheerio = require('cheerio');
var fs = require('fs');
var vm = require('vm');
const path = require('path');

/**
 * Expand the given Angular template
 *
 * @param mainTemplate {String} the path of the Angular template to expand. eg: index.html. Relative to options.srcDir, if
 * provided.
 * @param {Object} [options]
 * @param {Object} [options.scope] - The Angular-like $scope object to use when generating the template. This scope does
 * not need to be complete: expressions using non-provided values of the scope will not be evaluated at generation time 
 * and will be kept for browser instantiation time
 * @param {String} [options.viewTemplate] - Path of the Angular template to instantiate in lieu of the ng-view
 * directive. Relative to options.srcDir, if provided.
 * @param {String} [options.srcDir] - Source directory relative to which the paths of the main template, the
 * view template and the included template files will be computed.
 * @param {String} [options.baseUrl] - Base url relative to which the paths of the main template, the
 * view template and the included template files will be computed. If provided, then templates are loaded as URLs
 * and the srcDir option is not taken into account.
 * @returns {Promise} HTML text of the expanded template
 */
exports.expand = function (mainTemplate, options) {
	console.time('loadMainTemplate');
	return load(options, mainTemplate)
		.then(html => {
			console.timeEnd('loadMainTemplate');
			console.time('instantiate');
			var $scope = options ? (options.scope || {}) : {};
			var debugInfo = { path: mainTemplate, indent: 0 };
			return instantiate(html, $scope, options, debugInfo);
		})
		.then(output => {
			console.timeEnd('instantiate');
			return output.replace(/\[\[(.*?)]]/g, function (match, $1) {
				return "{{" + $1 + "}}";
			});
		});
};

function load(options, templatePath) {
	return new Promise(function (resolve, reject) {
		if (options && options.baseUrl) {
			if (templatePath[0] == '/') {
				templatePath = templatePath.substr(1);
			}
			var url = options.baseUrl + "/" + templatePath;
			console.time(url);
			request(url, function(error, response, body) {
				if (error) {
					reject(error);
				} else {
					console.timeEnd(url);
					resolve(body);
				}
			})
		} else {
			var file = templatePath;
			if (options && options.srcDir) {
				file = path.normalize(options.srcDir + "/" + templatePath);
			}
			console.time(file);
			fs.readFile(file, 'utf8', function (error, body) {
				if (error) {
					reject(error);
				} else {
					console.timeEnd(file);
					resolve(body);
				}
			});
		}
	});
}

function shallowCopy(object) {
	if (object instanceof Object) {
		var clone = {};
		for (var p in object) {
			clone[p] = object[p];
		}
		return clone;
	}
	throw "only objects can be shallow cloned";
}

function instantiate(html, $scope, options, debugInfo) {
	printStartDebug(debugInfo);
	var promises = [];
	var templateContext = vm.createContext(shallowCopy($scope));
	var $ = cheerio.load(html);
	var ngView = $("ng-view");
	if (ngView.length > 0) {
		if (options && options.viewTemplate) {
			promises.push(load(options, options.viewTemplate)
				.then(viewHtml => {
					return instantiate(viewHtml, $scope, options, indent(debugInfo));
				}).then(output => {
					ngView.html(output);
				}));
		} else {
			console.log("ng-view directive found but not option.templatePath was provided");
		}
	}
	// ng-repeat
	var repeats = $("*[ng-repeat]");
	repeats.each(function (i, elem) {
		var expr = $(this).attr('ng-repeat').trim();
		try {
			var result = parseRepeatExpression(expr);
			if (!result) return;
			var repeatContext = vm.createContext(shallowCopy(templateContext));
			// y part of "x in y"
			var collection = vm.runInContext(result.collectionExpr, repeatContext);
			//var innerHtml = $(this).html();
			// Remove the repeat body. Will be replaced by each instantiated item
			var clone = $(this).clone();
			clone.removeAttr("ng-repeat");
			var parentClone = $("<noop></noop>");
			parentClone.append(clone);
			var outerHtml = parentClone.html();
			var newChildren = [];
			var repeatPromises = [];
			const $this = $(this);
			for (const key in collection) {
				const itemContext = vm.createContext(shallowCopy(repeatContext));
				// Iterator variable (not sure if this one is really necessary - todo check parseRepeatExpression
				const keyInit = result.keyExpr + " = " + key;
				vm.runInContext(keyInit, itemContext);
				// x part of "x in y"
				const valueInit = result.valueExpr + " = " + result.collectionExpr + "[" + result.keyExpr + "]";
				vm.runInContext(valueInit, itemContext);
				const indexInit = "$index = " + key;
				vm.runInContext(indexInit, itemContext);
				repeatPromises.push(instantiate(outerHtml, itemContext, options, { path: "repeat " + (result.valueExpr + " = " + result.collectionExpr + "[" + key + "]"), indent: debugInfo.indent + 1 })
						.then(repeatHtml => {
							var item = $(repeatHtml);
							// Declare key, value and $index so that expressions that couldn't be evaluated server-side because the scope
							// was not complete, can still be evaluated when run in the browser
							// Add a [[ ]] around the expression that will be replaced with {{ }} at the end of the epxansion process
							// This will avoid having the expression replaced by instantiate() when trying to replace {{ }} expressions
							item.html("<span style='display: none'>[[" + keyInit + "; " + valueInit + "; " + indexInit + " ;\"\"]]</span>" + item.html());
							newChildren[newChildren.length] = item;
						}));
			}
			// All items have been added. Time to commit seppuku and rebirth as the list of instantiated items
			promises.push(Promise.all(repeatPromises).then(value => {
				$this.replaceWith(newChildren);
			}));
		} catch (exception) {
			debug("Could not evaluate repeat expression" + exception + " - Skipping it.");
		}
	});
	// ng-bind
	var binds = $("*[ng-bind]");
	binds.each(function (i, elem) {
		var expr = $(this).attr("ng-bind");
		try {
			var bindHtmlValue = vm.runInContext(expr, templateContext);
			$(this).html(bindHtmlValue);
			$(this).removeAttr("ng-bind");
		} catch (exception) {
			// Do nothing
			debug("Doing nothing: " + exception);
		}
	});
	// ng-bind-html
	var bindHtmls = $("*[ng-bind-html]");
	bindHtmls.each(function (i, elem) {
		var expr = $(this).attr("ng-bind-html");
		try {
			var bindHtmlValue = vm.runInContext(expr, templateContext);
			$(this).html(bindHtmlValue);
			$(this).removeAttr("ng-bind-html");
		} catch (exception) {
			// Do nothing
			debug("Doing nothing: " + exception);
		}
	});
	// ng-include
	var includes = $("ng-include");
	includes.each(function (i, elem) {
		var src = $(this).attr("src");
		if (src) {
			var includePath = vm.runInContext(src, templateContext);
			var idx = includePath.indexOf("?");
			if (idx != -1) {
				includePath = includePath.substr(0, idx);
			}
			var $this = $(this);
			promises.push(load(options, includePath)
				.then(includeHtml => {
					return instantiate(includeHtml, $scope, options, { path: includePath, indent: debugInfo.indent + 1 });
				})
				.then(includeOutput => {
					var newMe = $("<noop></noop>");
					newMe.html(includeOutput);
					// todo: make sure all attributes of the ng-include are copied to the noop tag...
					var ngShow = $this.attr("ng-show");
					if (ngShow) {
						newMe.attr("ng-show", ngShow);
					}
					$this.replaceWith(newMe);
				}));
		}
	});
	// ng-include
	var includes2 = $("*[ng-include]");
	includes2.each(function (i, elem) {
		var src = $(this).attr("ng-include");
		var includePath = vm.runInContext(src, templateContext);
		var idx = includePath.indexOf("?");
		if (idx != -1) {
			includePath = includePath.substr(0, idx);
		}
		var $this = $(this);
		promises.push(load(options, includePath)
			.then(includeHtml => {
				return instantiate(includeHtml, $scope, options, {path: includePath, indent: debugInfo.indent + 1});
			})
			.then(includeOutput => {
				$this.html(includeOutput);
				$this.removeAttr("ng-include");
			}));
	});
	return Promise.all(promises).then(value => {
		var output = $.html()
			.replace(/&lt;%/g, "<%")                       // <%
			.replace(/%&gt;/g, "%>")                       // %>
			.replace(/; i &lt;/g, "; i <")                 // ; i <
			.replace(/&quot;/g, '"')                       // "
			.replace(/&apos;/g, "'")                       // '
			.replace(/ &amp;&amp; /g, " && ")              // &&
			.replace(/{{(.*?)}}/g, function (match, expr) {
				try {
					var value = vm.runInContext(expr, templateContext);
					if (value) {
						return value;
					} else {
//					} else if (typeof value === 'undefined' || value === null) {
						return "{{" + expr + "}}";
					}
				} catch (exception) {
					debug("Expression cannot be interpreted against context. We leave it as is " + exception);
					return "{{" + expr + "}}";
				}
			});
		printEndDebug(debugInfo);
		return output;
	});
}

function parseRepeatExpression(expr) {
	var matches = expr.match(/^(.*?) in ([^\s]*)(.*?)$/);
	if (!matches) return false;

	var keyValueExpr = matches[1].trim();
	var collectionExpr = matches[2].trim();
	var keyExpr, valueExpr, m1, m2;
	if (m1 = keyValueExpr.match(/^\((\w+),\s?(\w+)\)$/)) { // (k,v)
		keyExpr = m1[1], valueExpr = m1[2];
	} else if (m2 = keyValueExpr.match(/^(\w+)$/)) {
		valueExpr = m2[1];
		keyExpr = 'i';
	}
	return {keyExpr: keyExpr, valueExpr: valueExpr, collectionExpr: collectionExpr};
}

function printStartDebug(debugInfo) {
	debug(space(debugInfo.indent) + "template [ " + debugInfo.path);
}
function printEndDebug(debugInfo) {
	debug(space(debugInfo.indent) + "]");
}

function indent(debugInfo) {
	return {
		indent: debugInfo.indent + 1,
		path: debugInfo.path
	}
}

function space(len) {
	var str = "";
	for (var i = 0; i < len; i++) {
		str += "  ";
	}
	return str;
}




