/*!
 * async.js
 * Copyright(c) 2010 Fabian Jakobs <fabian.jakobs@web.de>
 * MIT Licensed
 */

var sys = require("sys")
var async = require("./async")

exports.TestGenerator = function(source) {
    async.Generator.call(this, source)
}

sys.inherits(exports.TestGenerator, async.Generator)

;(function() {
    
    this.run = function() {
        return this.setupTest()
            .each(function(test, next) {
                if (test.setUpSuite)
                    test.setUpSuite(next);
                else
                    next();
            })
            .each(function(test, next) {
                test.test(function(err, passed) {
                    test.err = err
                    test.passed = passed
                    next()
                })
            })
            .each(function(test, next) {
                if (test.tearDownSuite)
                    test.tearDownSuite(next);
                else
                    next();
            })
    }
    
    this.report = function() {
        return this.each(function(test, next) {
            var color = test.passed ? "\x1b[33m" : "\x1b[31m";
            console.log(color + test.name + " " + (test.passed ? "OK" : "FAIL") + "\x1b[0m")
            if (!test.passed)                
                if (test.err.stack)
                    console.log(test.err.stack)
                else
                    console.log(test.err)
                    
            next()
        })
    }
    
    this.setupTest = function() {
        return this.each(function(test, next) {
            var empty = function(next) { next() }
            var context = test.context || this
            
            if (test.setUp)
                var setUp = async.makeAsync(0, test.setUp, context)
            else 
                setUp = empty

            tearDownCalled = false;
            if (test.tearDown)
                var tearDownInner = async.makeAsync(0, test.tearDown, context);
            else
                tearDownInner = empty
                
            function tearDown(next) {
                tearDownCalled = true;
                tearDownInner.call(test.context, next);
            }

            var testFn = async.makeAsync(0, test.fn, context)
                
            test.test = function(callback) {    
                var called            
                function errorListener(e) {
                    if (called)
                        return
                    called = true
                    process.removeListener('uncaughtException', errorListener)
                    if (!tearDownCalled) {
                        async.list([tearDown])
                            .call()
                            .timeout(test.timeout)
                            .end(function() {
                                callback(e, false);
                            })                    }
                    else
                        callback(e, false)
                }
                process.addListener('uncaughtException', errorListener)
                
                async.list([setUp, testFn, tearDown])
                    .delay(0)
                    .call(context)
                    .timeout(test.timeout)
                    .toArray(false, function(errors, values) {
                        if (called)
                            return
                        called = true
                        var err = errors[1]
                        process.removeListener('uncaughtException', errorListener)                            
                        callback(err, !err)                        
                    })
            }
            
            next()
        })
    }
    
}).call(exports.TestGenerator.prototype)

exports.testcase = function(testcase, timeout) {
    var methods = Object.keys(testcase)
    var setUp = testcase.setUp || null
    var tearDown = testcase.tearDown || null
    var tests = methods
        .filter(function(method) { 
            return method.indexOf("test") == 0 && typeof(testcase[method]) == "function"
        })
        .map(function(name) {
            return {
                name: name,
                setUp: setUp,
                tearDown: tearDown,
                context: testcase,
                timeout: timeout === undefined ? 3000 : timeout,
                fn: testcase[name]
            }
        })

    if (testcase.setUpSuite) {
        tests[0].setUpSuite = async.makeAsync(0, testcase.setUpSuite, testcase);
    }
    if (testcase.tearDownSuite) {
        tests[tests.length-1].tearDownSuite = async.makeAsync(0, testcase.tearDownSuite, testcase);
    }

    return async.list(tests, exports.TestGenerator)
}