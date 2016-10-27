var expander = require("../index");
var fs = require("fs");
var assert = require("assert");

var $scope = {
	headerLinks: [
		{ url: "https://sende.rs", name: "Senders" },
		{ url: "https://trackbuster.com", name: "Trackbuster", target: "" },
		{ url: "https://onemore.company", name: "One More Company", target: "_blank" }
	],
	title: "This is the title of my page",
	content: "This is the body of my page."
};

var generate = false;

expander.expand("index.html", { scope: $scope, srcDir: "test/data", viewTemplate: "/fragments/view.html"})
	.then(function(html) {
		var expected = "test/expected.html";
		if (generate) {
			fs.writeFile(expected, html);
			console.log("Generated test file", expected);
		} else {
			fs.readFile(expected, 'utf8', function (err, body) {
				assert.equal(html, body);
				console.log("Test OK");
			});
		}
	}).catch(err => {
	console.log(err);
});
