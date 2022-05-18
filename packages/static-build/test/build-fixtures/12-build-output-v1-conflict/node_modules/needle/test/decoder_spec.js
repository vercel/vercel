var should  = require('should'),
    needle  = require('./../'),
    Q       = require('q'),
    chardet = require('jschardet'),
    helpers = require('./helpers');

describe('character encoding', function() {

  var url;
  this.timeout(5000);

  describe('Given content-type: "text/html; charset=EUC-JP"', function() {

    before(function() {
      url = 'http://www.nina.jp/server/slackware/webapp/tomcat_charset.html';
    })

    describe('with decode = false', function() {

      it('does not decode', function(done) {

        needle.get(url, { decode: false }, function(err, resp) {
          resp.body.should.be.a.String;
          chardet.detect(resp.body).encoding.should.eql('windows-1252');
          resp.body.indexOf('EUCを使う').should.eql(-1);
          done();
        })

      })

    })

    describe('with decode = true', function() {

      it('decodes', function(done) {

        needle.get(url, { decode: true }, function(err, resp) {
          resp.body.should.be.a.String;
          chardet.detect(resp.body).encoding.should.eql('ascii');
          resp.body.indexOf('EUCを使う').should.not.eql(-1);
          done();
        })

      })

    })

  })

  describe('Given content-type: "text/html but file is charset: gb2312', function() {

    it('encodes to UTF-8', function(done) {

      // Our Needle wrapper that requests a chinese website.
      var task    = Q.nbind(needle.get, needle, 'http://www.chinesetop100.com/');

      // Different instantiations of this task
      var tasks   = [Q.fcall(task, {decode: true}),
                     Q.fcall(task, {decode: false})];

      var results = tasks.map(function(task) {
        return task.then(function(obj) {
          return obj[0].body;
        });
      });

      // Execute all requests concurrently
      Q.all(results).done(function(bodies) {

        var charsets = [
          chardet.detect(bodies[0]).encoding,
          chardet.detect(bodies[1]).encoding,
        ]

        // We wanted to decode our first stream as specified by options
        charsets[0].should.equal('ascii');
        bodies[0].indexOf('全球中文网站前二十强').should.not.equal(-1);

        // But not our second stream
        charsets[1].should.equal('windows-1252');
        bodies[1].indexOf('全球中文网站前二十强').should.equal(-1);

        done();
      });
    })
  })

  describe('Given content-type: "text/html"', function () {

    var server,
        port = 54321,
        text = 'Magyarországi Fióktelepe'

    before(function(done) {
      server = helpers.server({
        port: port,
        response: text,
        headers: { 'Content-Type': 'text/html' }
      }, done);
    })

    after(function(done) {
      server.close(done)
    })

    describe('with decode = false', function () {
      it('decodes by default to utf-8', function (done) {

        needle.get('http://localhost:' + port, { decode: false }, function (err, resp) {
          resp.body.should.be.a.String;
          chardet.detect(resp.body).encoding.should.eql('ISO-8859-2');
          resp.body.should.eql('Magyarországi Fióktelepe')
          done();
        })

      })

    })

  })
})
