// Generated by CoffeeScript 1.6.3
(function() {
  var Crypto, Fs, Http, Https, Path, QueryString, Url, accepted_image_mime_types, camo_hostname, content_length_limit, current_connections, debug_log, error_log, finish, four_oh_four, hexdec, logging_enabled, max_redirects, port, process_url, server, shared_key, socket_timeout, started_at, total_connections, version,
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  Fs = require('fs');

  Url = require('url');

  Path = require('path');

  Http = require('http');

  Https = require('https');

  Crypto = require('crypto');

  QueryString = require('querystring');

  port = parseInt(process.env.PORT || 8081);

  version = "2.0.1";

  shared_key = process.env.CAMO_KEY || '0x24FEEDFACEDEADBEEFCAFE';

  max_redirects = process.env.CAMO_MAX_REDIRECTS || 4;

  camo_hostname = process.env.CAMO_HOSTNAME || "unknown";

  socket_timeout = process.env.CAMO_SOCKET_TIMEOUT || 10;

  logging_enabled = process.env.CAMO_LOGGING_ENABLED || "disabled";

  content_length_limit = parseInt(process.env.CAMO_LENGTH_LIMIT || 5242880, 10);

  accepted_image_mime_types = JSON.parse(Fs.readFileSync(Path.resolve(__dirname, "mime-types.json"), {
    encoding: 'utf8'
  }));

  debug_log = function(msg) {
    if (logging_enabled === "debug") {
      console.log("--------------------------------------------");
      console.log(msg);
      return console.log("--------------------------------------------");
    }
  };

  error_log = function(msg) {
    if (logging_enabled !== "disabled") {
      return console.error("[" + (new Date().toISOString()) + "] " + msg);
    }
  };

  total_connections = 0;

  current_connections = 0;

  started_at = new Date;

  four_oh_four = function(resp, msg, url) {
    error_log("" + msg + ": " + ((url != null ? url.format() : void 0) || 'unknown'));
    resp.writeHead(404);
    if (resp.headers) {
      resp.headers["expires"] = "0";
      resp.headers["cache-control"] = "no-cache, no-store, private, must-revalidate";
    }
    return finish(resp, "Not Found");
  };

  finish = function(resp, str) {
    current_connections -= 1;
    if (current_connections < 1) {
      current_connections = 0;
    }
    return resp.connection && resp.end(str);
  };

  process_url = function(url, transferredHeaders, resp, remaining_redirects) {
    var Protocol, queryPath, requestOptions, srcReq;
    if (url.host != null) {
      if (url.protocol === 'https:') {
        Protocol = Https;
      } else if (url.protocol === 'http:') {
        Protocol = Http;
      } else {
        four_oh_four(resp, "Unknown protocol", url);
        return;
      }
      queryPath = url.pathname;
      if (url.query != null) {
        queryPath += "?" + url.query;
      }
      transferredHeaders.host = url.host;
      debug_log(transferredHeaders);
      requestOptions = {
        hostname: url.hostname,
        port: url.port,
        path: queryPath,
        headers: transferredHeaders
      };
      srcReq = Protocol.get(requestOptions, function(srcResp) {
        var contentType, contentTypePrefix, content_length, eTag, expiresHeader, is_finished, lastModified, newHeaders, newUrl, origin;
        is_finished = true;
        debug_log(srcResp.headers);
        content_length = srcResp.headers['content-length'];
        if (content_length > content_length_limit) {
          srcResp.destroy();
          return four_oh_four(resp, "Content-Length exceeded", url);
        } else {
          newHeaders = {
            'content-type': srcResp.headers['content-type'],
            'cache-control': srcResp.headers['cache-control'] || 'public, max-age=31536000',
            'Camo-Host': camo_hostname,
            'X-Content-Type-Options': 'nosniff'
          };
          if (eTag = srcResp.headers['etag']) {
            newHeaders['etag'] = eTag;
          }
          if (expiresHeader = srcResp.headers['expires']) {
            newHeaders['expires'] = expiresHeader;
          }
          if (lastModified = srcResp.headers['last-modified']) {
            newHeaders['last-modified'] = lastModified;
          }
          if (origin = process.env.CAMO_TIMING_ALLOW_ORIGIN) {
            newHeaders['Timing-Allow-Origin'] = origin;
          }
          if (content_length != null) {
            newHeaders['content-length'] = content_length;
          }
          if (srcResp.headers['transfer-encoding']) {
            newHeaders['transfer-encoding'] = srcResp.headers['transfer-encoding'];
          }
          if (srcResp.headers['content-encoding']) {
            newHeaders['content-encoding'] = srcResp.headers['content-encoding'];
          }
          srcResp.on('end', function() {
            if (is_finished) {
              return finish(resp);
            }
          });
          srcResp.on('error', function() {
            if (is_finished) {
              return finish(resp);
            }
          });
          switch (srcResp.statusCode) {
            case 200:
              contentType = newHeaders['content-type'];
              if (contentType == null) {
                srcResp.destroy();
                four_oh_four(resp, "No content-type returned", url);
                return;
              }
              contentTypePrefix = contentType.split(";")[0];
              if (__indexOf.call(accepted_image_mime_types, contentTypePrefix) < 0) {
                srcResp.destroy();
                four_oh_four(resp, "Non-Image content-type returned '" + contentTypePrefix + "'", url);
                return;
              }
              debug_log(newHeaders);
              resp.writeHead(srcResp.statusCode, newHeaders);
              return srcResp.pipe(resp);
            case 301:
            case 302:
            case 303:
            case 307:
              srcResp.destroy();
              if (remaining_redirects <= 0) {
                return four_oh_four(resp, "Exceeded max depth", url);
              } else if (!srcResp.headers['location']) {
                return four_oh_four(resp, "Redirect with no location", url);
              } else {
                is_finished = false;
                newUrl = Url.parse(srcResp.headers['location']);
                if (!((newUrl.host != null) && (newUrl.hostname != null))) {
                  newUrl.host = newUrl.hostname = url.hostname;
                  newUrl.protocol = url.protocol;
                }
                debug_log("Redirected to " + (newUrl.format()));
                return process_url(newUrl, transferredHeaders, resp, remaining_redirects - 1);
              }
              break;
            case 304:
              srcResp.destroy();
              return resp.writeHead(srcResp.statusCode, newHeaders);
            default:
              srcResp.destroy();
              return four_oh_four(resp, "Origin responded with " + srcResp.statusCode, url);
          }
        }
      });
      srcReq.setTimeout(socket_timeout * 1000, function() {
        srcReq.abort();
        return four_oh_four(resp, "Socket timeout", url);
      });
      srcReq.on('error', function(error) {
        return four_oh_four(resp, "Client Request error " + error.stack, url);
      });
      resp.on('close', function() {
        error_log("Request aborted");
        return srcReq.abort();
      });
      return resp.on('error', function(e) {
        error_log("Request error: " + e);
        return srcReq.abort();
      });
    } else {
      return four_oh_four(resp, "No host found " + url.host, url);
    }
  };

  hexdec = function(str) {
    var buf, i, _i, _ref;
    if (str && str.length > 0 && str.length % 2 === 0 && !str.match(/[^0-9a-f]/)) {
      buf = new Buffer(str.length / 2);
      for (i = _i = 0, _ref = str.length; _i < _ref; i = _i += 2) {
        buf[i / 2] = parseInt(str.slice(i, +(i + 1) + 1 || 9e9), 16);
      }
      return buf.toString();
    }
  };

  server = Http.createServer(function(req, resp) {
    var dest_url, encoded_url, hmac, hmac_digest, query_digest, transferredHeaders, url, url_type, user_agent, _base, _ref, _ref1;
    if (req.method !== 'GET' || req.url === '/') {
      resp.writeHead(200);
      return resp.end('hwhat');
    } else if (req.url === '/favicon.ico') {
      resp.writeHead(200);
      return resp.end('ok');
    } else if (req.url === '/status') {
      resp.writeHead(200);
      return resp.end("ok " + current_connections + "/" + total_connections + " since " + (started_at.toString()));
    } else {
      total_connections += 1;
      current_connections += 1;
      url = Url.parse(req.url);
      user_agent = (_base = process.env).CAMO_HEADER_VIA || (_base.CAMO_HEADER_VIA = "Camo Asset Proxy " + version);
      transferredHeaders = {
        'Via': user_agent,
        'User-Agent': user_agent,
        'Accept': (_ref = req.headers.accept) != null ? _ref : 'image/*',
        'Accept-Encoding': req.headers['accept-encoding'],
        'x-content-type-options': 'nosniff'
      };
      delete req.headers.cookie;
      _ref1 = url.pathname.replace(/^\//, '').split("/", 2), query_digest = _ref1[0], encoded_url = _ref1[1];
      if (encoded_url = hexdec(encoded_url)) {
        url_type = 'path';
        dest_url = encoded_url;
      } else {
        url_type = 'query';
        dest_url = QueryString.parse(url.query).url;
      }
      debug_log({
        type: url_type,
        url: req.url,
        headers: req.headers,
        dest: dest_url,
        digest: query_digest
      });
      if (req.headers['via'] && req.headers['via'].indexOf(user_agent) !== -1) {
        return four_oh_four(resp, "Requesting from self");
      }
      if ((url.pathname != null) && dest_url) {
        hmac = Crypto.createHmac("sha1", shared_key);
        hmac.update(dest_url, 'utf8');
        hmac_digest = hmac.digest('hex');
        if (hmac_digest === query_digest) {
          url = Url.parse(dest_url);
          return process_url(url, transferredHeaders, resp, max_redirects);
        } else {
          return four_oh_four(resp, "checksum mismatch " + hmac_digest + ":" + query_digest);
        }
      } else {
        return four_oh_four(resp, "No pathname provided on the server");
      }
    }
  });

  console.log("SSL-Proxy running on " + port + " with pid:" + process.pid + ".");

  server.listen(port);

}).call(this);
