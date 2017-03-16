/*!
 * Module dependencies.
 */

var Command = require('./util/command'),
    config = require('../common/config'),
    cordova = require('../cordova').cordova,
    cordovaCommon = require('cordova-common'),
    network = require('./util/network'),
    shell = require('shelljs'),
    path = require('path'),
    util = require('util'),
    fs = require('fs'),
    init = require('init-package-json'),
    Q = require('q'),
    e;
    //validateName = require('validate-npm-package-name'); ToDo: @carynbear validate npm package name

var CordovaCreate = require('cordova-create');

/*!
 * Command setup.
 */

module.exports = {
    create: function(phonegap) {
        return new CreateCommand(phonegap);
    }
};

function CreateCommand(phonegap) {
    return Command.apply(this, arguments);
}

util.inherits(CreateCommand, Command);

/**
 * Create a New App.
 *
 * Creates an project on the local filesystem.
 * This project is backwards compatible with Apache Cordova projects.
 *
 * Options:
 *
 *   - `options` {Object} is data required to create an app
 *     - `path` {String} is a directory path for the app.
 *     - `name` {String} is the application name (default: 'helloworld')
 *     - `id` {String} is the package name (default: 'com.phonegap.hello-world')
 *     - `config` {Object} is a JSON configuration object (default: {})
 *     - `link-to` {String} is a path to a project to link (default: undefined)
 *     - `copy-from` {String} is a path to a project to copy (default: undefined)
 *   - [`callback`] {Function} is triggered after creating the app.
 *     - `e` {Error} is null unless there is an error.
 *
 * Returns:
 *
 *   {PhoneGap} for chaining.
 */

CreateCommand.prototype.run = function(options, callback) {
    // require options
    if (!options) throw new Error('requires option parameter');
    if (!options.path) throw new Error('requires option.path parameter');

    // optional callback
    callback = callback || function() {};

    // validate options
    options.path = path.resolve(options.path.toString());
    options.name = options.name || 'helloworld';
    options.id = options.id || 'com.phonegap.helloworld';

    // create app
    this.execute(options, callback);

    return this.phonegap;
};

/*!
 * Execute.
 */

CreateCommand.prototype.execute = function(options, callback) {
    var self = this;
    var cfg;            // Create config
    var customWww;      // Template path
    var wwwCfg;         // Template config
    Q.fcall(function(){
        // Handle verbose
        if (options.verbose) {
            self.phonegap.on('verbose', function() {
                self.phonegap.emit('log', '\033[35m[verbose] \033[0m' + arguments[0])
            });
        }

        // if exists, use the JSON object in options.config to init the config
        if (options.config && Object.keys(options.config).length > 0) {
            cfg = options.config;
        } else {
            cfg = {};
        }

        // validate options.template
        options.template = (typeof options.template === 'string') ? options.template : null;

        // Internal templates (designated in package.json) can be referenced by their short name (i.e. "push" instead of "phonegap-template-push")
        // If short name is invalid, use 'hello-world' template
        options.template = getTemplateInfo(options.template || 'hello-world');

        customWww = options['copy-from'] || options.template;

        // format template src into correct cfg format for Cordova Create to handle
        if (customWww) {
            if ((!options.template || !options['copy-from']) && customWww.indexOf('http') === 0) {
                e = new Error('Only local paths for custom www assets are supported: ' + customWww);
                self.phonegap.emit('error', '\033[1m \033[31m Error from PhoneGap Create: ' + e.message);
                if (options.verbose) {
                    console.trace();
                }
                throw e;
            }

            // Resolve tilda
            if (customWww.substr(0,1) === '~')
                customWww = path.join(process.env.HOME,  customWww.substr(1));

            wwwCfg = {
                url: customWww,
                template: false
            };

            if (options.template) {
                wwwCfg.template = true;
            } else if (args['copy-from']) {
                self.phonegap.emit('warn', '--copy-from option is being deprecated. Consider using --template instead.');
                wwwCfg.template = true;
            }

            cfg.lib = cfg.lib || {};
            cfg.lib.www = cfg.lib.www || wwwCfg;
        } else {
            e = new Error("should always have a template (either user supplied or default).")
            self.phonegap.emit('error', '\033[1m \033[31m Error from PhoneGap Create: ' + e.message);
            if (options.verbose) {
                console.trace();
            }
            throw e;
        }
    return CordovaCreate(options.path, options.id, options.name, cfg, self.phonegap)
        .fail(function (err) {
            self.phonegap.emit('error', '\033[1m \033[31m Error from Cordova Create: ' + err.message);
            if (options.verbose) {
                console.trace();
            }
            throw err;
        });
    }).then(function () {
        console.log(1);
        // Find the latest version of Cordova published
        var cordovaVersionCommand = 'npm show cordova version';
        // Find the system version of Cordova installed //To/Do: handle dev version case
        //var cordovaVersionCommand = 'cordova -v'
        
        var deferred = Q.defer();
        shell.exec(cordovaVersionCommand, {silent:true}, function(code, stdout, stderr) {
            if (code != 0) {
                e = new Error('using npm to check cordova version: '+ stdout.replace('\n',''));
                self.phonegap.emit('error', '\033[1m \033[31m Error from PhoneGap Create: ' + e.message);
                if (options.verbose) {
                    console.trace();
                }
                deferred.reject(e);
            } else {
                self.phonegap.emit('verbose', 'Project using Cordova '+ stdout.replace('\n',''))
                deferred.resolve(stdout.replace('\n',''));
            }
            console.log(1);
        });
        return deferred.promise;
    }).then(function(cordovaVersion){
        console.log(2);
        var pkgJsonPath = path.resolve(options.path, 'package.json');
        var configPath = path.resolve(options.path, 'config.xml'); //Cordova Create will create or move config.xml to project root
        var pkgjson;
        // Update package.json; create it if does not exist
        if (!fs.existsSync(pkgJsonPath)) {
            console.log(2);
            self.phonegap.emit('warn', 'No package.json was found for your project. Creating one from config.xml');
            var config = new cordovaCommon.ConfigParser(configPath);
            console.log(3);
            pkgjson = {};
            pkgjson.name = (config.name() || path.basename(options.path)).toLowerCase(); 
            //ToDo: @carynbear validate npm package name
            pkgjson.version = config.version() || '1.0.0';
            pkgjson.dependencies = { 
                "cordova" : "^"+cordovaVersion
            };
            fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgjson, null, 4), 'utf8');
        } else {
            pkgjson = require(pkgJsonPath);
            util._extend(pkgjson.dependencies, {"cordova" : "^"+cordovaVersion});
            fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgjson, null, 4), 'utf8');
        }
        callback(e);
        return self.phonegap;
    }).fail(function(err){
        self.phonegap.emit('warn', 'PhoneGap Create failed.');
        callback(err);
    })
    
    
};

/*!
 * Get Template Info.
 *
 * Attempts to get the template information and generates the UUID used by
 * Cordova's fetching system.
 *
 * If an error occurs, an error object is returned instead.
 *
 * Returns:
 *
 *   {Object | Error}
 */

function getTemplateInfo(name) {
    var templates = require('../../package.json').templates,
        template;

    try {
        template = templates[name].npm;

    }
    catch(e) {
        // return null for non-string values otherwise the name
        template = (typeof name === 'string') ? name : undefined;
    }

    return template;
}
