var dataExport       = require('../data/export'),
    dataImport       = require('../data/import'),
    dataProvider     = require('../models'),
    fs               = require('fs-extra'),
    path             = require('path'),
    when             = require('when'),
    nodefn           = require('when/node/function'),
    _                = require('lodash'),
    schema           = require('../data/schema').tables,
    config           = require('../config'),
    errors           = require('../../server/errorHandling'),
    api              = {},
    db;

api.notifications    = require('./notifications');
api.settings         = require('./settings');

db = {
    'exportContent': function (req, res) {
        /*jslint unparam:true*/
        return dataExport().then(function (exportedData) {
            // Save the exported data to the file system for download
            var fileName = path.join(config().paths.exportPath, 'exported-' + (new Date().getTime()) + '.json');

            return nodefn.call(fs.writeFile, fileName, JSON.stringify(exportedData)).then(function () {
                return when(fileName);
            });
        }).then(function (exportedFilePath) {
            // Send the exported data file
            res.download(exportedFilePath, 'GhostData.json');
        }).otherwise(function (error) {
            // Notify of an error if it occurs
            return api.notifications.browse().then(function (notifications) {
                var notification = {
                    type: 'error',
                    message: error.message || error,
                    status: 'persistent',
                    id: 'per-' + (notifications.length + 1)
                };

                return api.notifications.add(notification).then(function () {
                    res.redirect(config().paths.debugPath);
                });
            });
        });
    },
    'importContent': function (options) {
        var busboy = options.BusBoy,
            deferred = when.defer(),
            foundFile = false,
            uploadError,
            parser;

        busboy.on('error', function (e) {
            deferred.reject({
                errorCode: 500,
                message: e.message
            });
        });

        busboy.instance.on('end', function () {
            if (foundFile) {
                return;
            }

            deferred.reject({
                errorCode: 500,
                message: 'Please select a .json file to import.'
            });
        });

        busboy.instance.on('file', function (fieldname, file, filename) {
            if (!filename || filename.indexOf('json') === -1) {
                uploadError = {
                    errorCode: 500,
                    message: 'Please select a .json file to import.'
                };
            } else if (fieldname !== 'importfile') {
                uploadError  = {
                    errorCode: 500,
                    message: 'Encountered invalid fieldname in upload form.'
                };
            }

            if (uploadError) {
                // Flush the stream.
                file.resume();
                // Send the error.
                return deferred.reject(uploadError);
            }

            foundFile = true;

            parser = new busboy.JSONParser();

            parser.on('parseError', function (e) {
                errors.logError(e, "API DB import content", "check that the import file is valid JSON.");
                return deferred.reject(new Error("Failed to parse the import JSON file"));
            });

            parser.on('parseComplete', function (importData) {
                console.log(importData);
                api.settings.read({ key: 'databaseVersion' }).then(function (setting) {
                    return when(setting.value);
                }, function () {
                    return when('001');
                }).then(function (version) {
                    var error = '',
                        tableKeys = _.keys(schema);

                    if (!importData.meta || !importData.meta.version) {
                        return deferred.reject(new Error("Import data does not specify version"));
                    }

                    _.each(tableKeys, function (constkey) {
                        _.each(importData.data[constkey], function (elem) {
                            var prop;
                            for (prop in elem) {
                                if (elem.hasOwnProperty(prop)) {
                                    if (schema[constkey].hasOwnProperty(prop)) {
                                        if (!_.isNull(elem[prop])) {
                                            if (elem[prop].length > schema[constkey][prop].maxlength) {
                                                error += error !== "" ? "<br>" : "";
                                                error += "Property '" + prop + "' exceeds maximum length of " + schema[constkey][prop].maxlength + " (element:" + constkey + " / id:" + elem.id + ")";
                                            }
                                        } else {
                                            if (!schema[constkey][prop].nullable) {
                                                error += error !== "" ? "<br>" : "";
                                                error += "Property '" + prop + "' is not nullable (element:" + constkey + " / id:" + elem.id + ")";
                                            }
                                        }
                                    } else {
                                        error += error !== "" ? "<br>" : "";
                                        error += "Property '" + prop + "' is not allowed (element:" + constkey + " / id:" + elem.id + ")";
                                    }
                                }
                            }
                        });
                    });

                    if (error !== "") {
                        return deferred.reject(new Error(error));
                    }
                    // Import for the current version
                    return dataImport(version, importData);
                }).then(function importSuccess() {
                    return api.settings.updateSettingsCache();
                }).then(function () {
                    return deferred.resolve({message: 'Posts, tags and other data successfully imported'});
                }).otherwise(function importFailure(error) {
                    return deferred.reject({errorCode: 500, message: error.message || error});
                });
            });

            file.pipe(parser);
        });

        busboy.start();

        return deferred.promise;
    },
    'deleteAllContent': function () {
        return when(dataProvider.deleteAllContent())
            .then(function () {
                return when.resolve({message: 'Successfully deleted all content from your blog.'});
            }, function (error) {
                return when.reject({errorCode: 500, message: error.message || error});
            });
    }
};

module.exports = db;
