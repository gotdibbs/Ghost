var BusBoy         = require('busboy'),
    Writable       = require('stream').Writable,
    EventEmitter   = require('events').EventEmitter,
    util           = require('util');

function JSONParser() {
    var self = this;

    self.buffers = [];
    Writable.call(this);

    this.on('finish', function () {
        var buffer = Buffer.concat(self.buffers);

        try {
            self.data = JSON.parse(buffer.toString());
        } catch (e) {
            return self.emit('parseError', e);
        }

        self.emit('parseComplete', self.data);
    });
}
util.inherits(JSONParser, Writable);

JSONParser.prototype._write = function _write(chunk, callback) {
    this.buffers.push(chunk);
    callback();
};

function GhostBusBoy(req) {
    EventEmitter.call(this);

    this.JSONParser = JSONParser;
    this.request = req;
    this.instance = new BusBoy({ headers: req.headers });

    this.instance.on('limit', function () {
        this.emit('error', { errorCode: 413, message: 'File size limit breached.' });
    });

    this.instance.on('error', function (error) {
        this.emit('error', { errorCode: 500, message: error.message });
    });
}

util.inherits(GhostBusBoy, EventEmitter);

GhostBusBoy.prototype.start = function start() {
    this.request.pipe(this.instance);
};

/*jslint unparam: true*/
function register(req, res, next) {
    // busboy is only used for POST requests
    if (req.method && !/post/i.test(req.method)) {
        return next();
    }

    req.BusBoy = new GhostBusBoy(req);

    next();
}

module.exports = register;