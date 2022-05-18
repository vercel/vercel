var http = require('http');
var httpShutdown = require('./index').extend();
var should = require('chai').should();
var request = require('request');

describe('http-shutdown', function(done) {
  it('Should shutdown with no traffic', function(done) {
    var server = http.createServer(function(req, res) {
      done.fail();
    }).withShutdown();

    server.listen(16789, function() {
      server.shutdown(function(err) {
        should.not.exist(err);
        done();
      })
    })
  });

  it('Should shutdown with outstanding traffic', function(done) {
    var server = http.createServer(function(req, res) {
      setTimeout(function() {
        res.writeHead(200);
        res.end('All done');
      }, 500);
    }).withShutdown();

    server.listen(16789, function(err) {
      request.get('http://localhost:16789/', function(err, response) {
        should.not.exist(err);
        response.statusCode.should.equal(200);
        done();
      });

      setTimeout(server.shutdown, 100);
    });
  });

  it('Should force shutdown without waiting for outstanding traffic', function(done) {
    var server = http.createServer(function(req, res) {
      setTimeout(function() {
        done.fail();
      }, 500);
    }).withShutdown();

    server.listen(16789, function(err) {
      request.get('http://localhost:16789/', function(err, response) {
        should.exist(err);
        done();
      });

      setTimeout(server.forceShutdown, 100);
    });
  });
});
