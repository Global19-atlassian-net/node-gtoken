var assert = require('assert');
var fs = require('fs');
var GoogleToken = require('../lib/index.js');
var EMAIL = 'example@developer.gserviceaccount.com';
var KEYFILE = './test/assets/key.pem';
var P12FILE = './test/assets/key.p12';
var KEYCONTENTS = fs.readFileSync(KEYFILE);
var SCOPE1 = 'https://www.googleapis.com/auth/urlshortener';
var SCOPE2 = 'https://www.googleapis.com/auth/drive';
var SCOPES = [ SCOPE1, SCOPE2 ];
var sandbox = require('sandboxed-module');

var GOOGLE_TOKEN_URL = 'https://accounts.google.com/o/oauth2/token';
var GOOGLE_REVOKE_TOKEN_URL = 'https://accounts.google.com/o/oauth2/revoke?token=';

var TESTDATA = {
  email: 'email@developer.gserviceaccount.com',
  scope: 'scope123', // or space-delimited string of scopes
  key: 'abc123key'
};

var TESTDATA_KEYFILE = {
  email: 'email@developer.gserviceaccount.com',
  scope: 'scope123', // or space-delimited string of scopes
  keyFile: KEYFILE
};

var TESTDATA_P12 = {
  email: 'email@developer.gserviceaccount.com',
  scope: 'scope123', // or space-delimited string of scopes
  keyFile: P12FILE
};

var MIME = {
  lookup: function(filename) {
    if(filename === P12FILE) {
      return 'application/x-pkcs12';
    } else {
      return '';
    }
  }
};

var noop = function(){};

describe('gtoken', function() {
  it('should exist', function() {
    assert.equal(typeof GoogleToken, 'function');
  });

  it('should work without new or options', function() {
    var gtoken = require('../lib/index.js')();
    assert(gtoken);
  });

  describe('.iss', function() {
    it('should be set from email option', function() {
      var gtoken = require('../lib/index.js')({
        email: EMAIL
      });
      assert.equal(gtoken.iss, EMAIL);
      assert.equal(gtoken.email, undefined);
    });

    it('should be set from iss option', function() {
      var gtoken = require('../lib/index.js')({
        iss: EMAIL
      });
      assert.equal(gtoken.iss, EMAIL);
    });

    it('should be set from email option over iss option', function() {
      var gtoken = require('../lib/index.js')({
        iss: EMAIL,
        email: 'another' + EMAIL
      });
      assert.equal(gtoken.iss, 'another' + EMAIL);
    });
  });

  describe('.scope', function() {
    it('should accept strings', function() {
      var gtoken = require('../lib/index.js')({
        scope: 'hello world'
      });
      assert.equal(gtoken.scope, 'hello world');
    });

    it('should accept array of strings', function() {
      var gtoken = require('../lib/index.js')({
        scope: [ 'hello', 'world' ]
      });
      assert.equal(gtoken.scope, 'hello world');
    });
  });

  describe('.hasExpired()', function() {
    it('should exist', function() {
      var gtoken = require('../lib/index.js')();
      assert.equal(typeof gtoken.hasExpired, 'function');
    });

    it('should detect expired tokens', function() {
      var gtoken = require('../lib/index.js')();
      assert(gtoken.hasExpired(), 'should be expired without token');
      gtoken.token = 'hello';
      assert(gtoken.hasExpired(), 'should be expired without expires_at');
      gtoken.expires_at = (new Date().getTime()) + 10000;
      assert(!gtoken.hasExpired(), 'shouldnt be expired with future date');
      gtoken.expires_at = (new Date().getTime()) - 10000;
      assert(gtoken.hasExpired(), 'should be expired with past date');
      gtoken.expires_at = (new Date().getTime()) + 10000;
      gtoken.token = null;
      assert(gtoken.hasExpired(), 'should be expired with no token');
    });
  });

  describe('.revokeToken()', function() {
    it('should exist', function() {
      var gtoken = require('../lib/index.js')();
      assert.equal(typeof gtoken.revokeToken, 'function');
    });


    it('should run ._configure()', function(done) {
      var gtoken = require('../lib/index.js')();
      gtoken.token = 'woot';
      gtoken._request = function(opts, cb) {
        assert.equal(opts, GOOGLE_REVOKE_TOKEN_URL+'woot');
        cb();
      };
      gtoken._configure = function(options) {
        assert(options);
      };
      gtoken.revokeToken(done);
    });

    it('should return error when no token set', function(done) {
      var gtoken = require('../lib/index.js')();
      gtoken.token = null;
      gtoken.revokeToken(function(err) {
        assert(err && err.message);
        done();
      });
    });
  });

  describe('.getToken()', function() {
    it('should exist', function() {
      var gtoken = GoogleToken();
      assert.equal(typeof gtoken.getToken, 'function');
    });

    it('should run jws.sign() with correct object', function(done) {
      var gtoken = GoogleToken(TESTDATA);
      gtoken._signJWT = function(data) {
        assert.deepEqual(data.header, {
          alg: 'RS256',
          typ: 'JWT'
        });
        assert(data.payload);
        assert.equal(data.payload.iss, 'email@developer.gserviceaccount.com');
        assert.equal(data.payload.scope, 'scope123');
        assert.equal(data.payload.aud, GOOGLE_TOKEN_URL);
        assert.equal(data.secret, 'abc123key');
        done();
      };

      gtoken.getToken(noop);
    });

    it('should read .pem keyFile from file', function(done) {
      var gtoken = GoogleToken(TESTDATA_KEYFILE);

      gtoken._signJWT = function(opts, cb) {
        cb();
      };

      gtoken._request = function(opts, cb) {
        cb();
      };

      gtoken.getToken(function(err, token) {
        assert.deepEqual(gtoken.key, KEYCONTENTS);
        done();
      });
    });

    it('should return cached token if not expired', function(done) {
      var gtoken = GoogleToken(TESTDATA);
      gtoken.token = 'mytoken';
      gtoken.expires_at = new Date().getTime() + 10000;
      gtoken.getToken(function(err, token) {
        assert.equal(token, 'mytoken');
        done();
      });
    });

    it('should run mime.lookup if keyFile given', function(done) {
      var mime = {
        lookup: function(filename) {
          assert.equal(filename, KEYFILE);
          done();
        }
      };

      var gtoken = sandbox.require('../lib/index.js', {
        requires: {
          'mime': mime
        }
      })(TESTDATA_KEYFILE);

      gtoken._request = function(opts, callback) {
        callback();
      };
      gtoken.getToken(noop);
    });

    it('should run gp12pem if .p12 file is given', function(done) {
      var gtoken = sandbox.require('../lib/index.js', {
        requires: {
          'mime': MIME,
          'google-p12-pem': function(filename, callback) {
            assert.equal(filename, P12FILE);
            done();
          }
        }
      })(TESTDATA_P12);
      gtoken.getToken(noop);
    });

    describe('request', function() {
      it('should be run with correct options', function(done) {
        var gtoken = GoogleToken(TESTDATA);
        gtoken._signJWT = function sign(opts, callback) {
          callback(null, 'signedJWT123');
        };

        gtoken._request = function(options, callback) {
          assert.deepEqual(options, {
            method: 'post',
            url: GOOGLE_TOKEN_URL,
            form: {
              grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
              assertion: 'signedJWT123'
            }
          });
          callback();
        };

        gtoken.getToken(done);
      });

      it('should set and return correct properties on success', function(done) {
        var gtoken = GoogleToken(TESTDATA);

        var RESPBODY = JSON.stringify({
          access_token: 'accesstoken123',
          expires_in: 3600,
          token_type: 'Bearer'
        });

        gtoken._request = function(options, callback) {
          callback(null, 'res', RESPBODY);
        };

        gtoken._signJWT = function(opts, callback) {
          callback(null, 'signedJWT123');
        };

        gtoken.getToken(function(err, token) {
          assert.deepEqual(gtoken.raw_token, JSON.parse(RESPBODY));
          assert.equal(gtoken.token, 'accesstoken123');
          assert.equal(gtoken.token, token);
          assert.equal(err, null);
          assert(gtoken.expires_at >= (new Date()).getTime());
          assert(gtoken.expires_at <= (new Date()).getTime() + (3600 * 1000));
          done();
        });
      });

      it('should set and return correct properties on error', function(done) {
        var ERROR = new Error('An error occurred.');
        var gtoken = GoogleToken(TESTDATA);

        var RESPBODY = JSON.stringify({
          access_token: 'accesstoken123',
          expires_in: 3600,
          token_type: 'Bearer'
        });

        gtoken._request = function(options, callback) {
          callback(ERROR);
        };

        gtoken._signJWT = function sign(opts, callback) {
          callback(null, 'signedJWT123');
        };

        gtoken.getToken(function(err, token) {
          assert.equal(gtoken.raw_token, null);
          assert.equal(gtoken.token, null);
          assert.equal(gtoken.token, token);
          assert.equal(err, ERROR);
          assert.equal(gtoken.expires_at, null);
          done();
        });
      });
    });
  });
});


