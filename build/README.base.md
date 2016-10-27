# Angular Template Expander

Generate an SEO-friendly version of an Angular 1 template file

## Install

    npm install -g angular-expander

## Usage

    var expander = require('angular-expander');
    // Path of the template to expand
    var mainPath = "src/index.html";
    // The (possibly partial) scope that will be used for expanding the template
    var $scope = {
        title: "My Page",
        body: "This is the body of the page",
        og: {
            title: "My Page",
            image: "https://acme.oom/images/myimage.png"
        }
    };
    // Optional: if your template contains a ng-view directive, you can specify
    // the path of the template used for the route you wish to expand
    var viewPath = "src/fragments/myView.html";
    expander.expand(mainPath, { scope: $scope, viewTemplate: viewPath }).then(function(html) {
        // This is the text of the expanded template.
        console.log(html);
    });

## Why do I need this?

I use this module to pre-generate a static HTML file from an Angular template file. The `$scope` is a partial instance
of the angular $scope that would be seen at browser execution time. It will typically contain enough material such
as text, titles, og:* values , etc., to make it SEO/social friendly for bots such as Google, Facebook, Slack etc.

Note that it is not necessary to pass a complete `$scope` to the expander, so only SEO-related content can be expanded
and all the true dynamic stuff can be left to the client side of things.

Using that module, I have been able to get rid of PhantomJS to generate SEO-friendly stuff, which was way too heavy
for that matter and had too many issues (for instance tags such as AddThis or the FB pixel are half broken when
pre-expanded via Phantom).

This module is now part of my build process, to build the static and searchable pages of my site. I also use it in
an AWS Lambda function, to dynamically generate some pages with the proper SEO stuff, especially open graph
information.

## Supported constructions

####`<ng-include src="...">`

The content of the included file will be expanded inside the node. The ng-include tag
will be replaced with a `<noop>` tag. This way, Angular will not try to interpret the include again at browser
execution time. If a `ng-show` attribute was attached to that directuve, it will be added to the `noop` element.

####`<... ng-include="...">`

The content of the included file will be expanded inside the node and the ng-include attribute
will be removed. This way, Angular will not try to interpret the include again at browser execution time.

####`<... ng-repeat="...">`

The repeat expression (ie: `b` in `a in b`) is evaluated against the provided `$scope`. If the expression can be
evaluated (no exception thrown, no `undefined` value), each item is expanded against a scope enhanced with the value
of the repeat expression for the ith index, and the value of the index.

####`<... ng-bind="...">`

If the value of the ng-bind expression can be interpreted against the `$scope` (no exception thrown, no `undefined`
value), it is inserted inside the element. The `ng-bind` attribute is then removed.

####`<... ng-bind-html="...">`

If the value of the ng-bind-html expression can be interpreted against the `$scope` (no exception thrown, no `undefined`
value), it is inserted inside the element. The `ng-bind-html` attribute is then removed.

####`<ng-view>`

If an `ng-view` directive is found and a `viewPath` argument was provided, the content of the template file designated
by `viewPath` is expanded and appended inside the `ng-view`.
Note that the `ng-view` directive is kept so that the routing mechanism is kept on the client. It means that the content
inserted is only for SEO purpose.

#### {{...}}

Any expression inside double curly-braces will be evaluated against the `$scope` (possibly enriched if a repeat directive
is being expanded). If that expression can be interpreted (no exception thrown, no `undefined` value), it will replace
the content if the curly-braces.

## Limitations

This module has been tailored for a specific set of HTML files, ie. the ones I wrote for my current web project
(https://sende.rs). See examples in the `data` directory. There are certainly tons of edge cases that are not handled
here. Feel free to extend this module to fit your needs.

## Release notes

### 3.0.0

Changed the signature of the expand method so that the template path is a mandatory parameters, and others are gathered
in an `options` object. I also took the opportunity to make the parsing fully async and all promise-based.

### 2.0.0

I refactored the code in order to make it as asynchronous as possible.
Therefore, I changed the signature of the expander, returning a Promise instead of the html result.
I still load included template files synchronously because it would change the code too drastically. I'll tackle this
down in a next release.
