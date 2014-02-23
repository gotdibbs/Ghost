// # Local File System Image Storage module
// The (default) module for storing images, using the local file system

var _       = require('lodash'),
    express = require('express'),
    fs      = require('fs-extra'),
    nodefn  = require('when/node/function'),
    path    = require('path'),
    when    = require('when'),
    errors  = require('../errorHandling'),
    config  = require('../config'),
    baseStore   = require('./base'),

    localFileStore;

localFileStore = _.extend(baseStore, {
    // ### Save
    // Saves the image to storage (the file system)
    // - image is the express image object
    // - returns a promise which ultimately returns the full url to the uploaded image
    'save': function (file, filename) {
        var saved = when.defer(),
            targetDir = this.getTargetDir(config().paths.imagesPath),
            stream,
            targetFilename;

        this.getUniqueFileName(this, filename, targetDir).then(function (filename) {
            targetFilename = filename;
            return nodefn.call(fs.mkdirs, targetDir);
        }).then(function () {
            file.on('end', function () {
                var fullUrl = (config().paths.subdir + '/' + path.relative(config().paths.appRoot, targetFilename)).replace(new RegExp('\\' + path.sep, 'g'), '/');
                return saved.resolve(fullUrl);
            });

            stream = fs.createWriteStream(targetFilename);

            stream.on('error', function (e) {
                errors.logError(e);
                return saved.reject(e);
            });

            file.pipe(stream);
        }).otherwise(function (e) {
            errors.logError(e);
            return saved.reject(e);
        });

        return saved.promise;
    },

    'exists': function (filename) {
        // fs.exists does not play nicely with nodefn because the callback doesn't have an error argument
        var done = when.defer();

        fs.exists(filename, function (exists) {
            done.resolve(exists);
        });

        return done.promise;
    },

    // middleware for serving the files
    'serve': function () {
        var ONE_HOUR_MS = 60 * 60 * 1000,
            ONE_YEAR_MS = 365 * 24 * ONE_HOUR_MS;

        // For some reason send divides the max age number by 1000
        return express['static'](config().paths.imagesPath, {maxAge: ONE_YEAR_MS});
    }
});

module.exports = localFileStore;
