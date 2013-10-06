/* -*- mode: js2; js2-basic-offset: 2; indent-tabs-mode: nil -*- */
/**
   This file is provided to you under the Apache License,
   Version 2.0 (the "License"); you may not use this file
   except in compliance with the License.  You may obtain
   a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing,
   software distributed under the License is distributed on an
   "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
   KIND, either express or implied.  See the License for the
   specific language governing permissions and limitations
   under the License.
**/

/**
 * This is a Javascript client for the Riak REST API. It
 * has two dependencies:
 *   Douglas Crockford's JSON library: http://www.json.org/js.html
 *   jQuery: http://jquery.com/ (but only for Ajax requests)
 *
 */

/**
 * TODO: Handle sibling values
 */

/**
 * Utility functions which don't belong anywhere else
 */
var RiakUtil = function() {
  return {
    /**
     * Base64 encode a number
     * @param num - Number to encode
     * @return string containing base64 encoded number
     */
    base64Encode: function(num) {
      var base64digits = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        return base64digits[(num >>> 26)] + base64digits[((num >>> 20)&63)] +
               base64digits[((num >>> 14)&63)] + base64digits[((num >>> 8)&63)] +
               base64digits[((num >>> 2)&63)] + base64digits[((num << 4)&63)] + '==';
    },
    /**
     * Trim spaces from beginning/end of text
     * @param text - Text to trimg
     * @return string with leading & trailing spaces removed
     */
    trim: function(text) {
      var tmp = text.replace(/^\s+/, '');
      return tmp.replace(/\s+$/, '');
    },

    /**
     * Was request successful?
     * @param req- XMLHttpRequest object
     * @return true if status is 2xx, false otherwise
     */
    wasSuccessful: function(req) {
      return req.status > 199 && req.status < 300;
    },
    /**
     * Create a modified accepts object
     */
    multipart_accepts: function() {
      var current = jQuery.ajaxSettings.accepts;
      var accepts = {};
      for (prop in current) {
        accepts[prop] = current[prop];
      }
      accepts.multipart = "multipart/mixed;q=1.1";
      return accepts;
    },
    get_boundary: function(contentType) {
      var idx = contentType.indexOf("boundary=");
      if(idx < 0)
        throw('Could not locate boundary for multipart/mixed');
      return contentType.substr(idx+9);
    },
    /**
     * Parse a 300 request into siblings.  This handles embedded
     * new lines and control characters.  Unfortunately Firefox
     * seems to trim embedded \000 in the XHR response.  Beware
     * for binary data (images etc) you may need to set allow_mult
     * false for the bucket until an alternative is found.
     *
     * @param contentType content type header with boundary information
     * @param text body of 300 response to be split
     * @return true if status is 2xx, false otherwise
     */
    parseSiblings: function(contentType, text) {
      var prefixAt = function(idx, prefix) {
        return (text.substr(idx, prefix.length) === prefix);
      };
      var nextChunk = function(lookFor, start_idx) {
        var idx = text.indexOf(lookFor, start_idx);
        if (idx < 0)
          throw("Could not find next chunk");
        return idx;
      };

      var boundary = RiakUtil.get_boundary(contentType);
      var nextBoundary = "--"+boundary+"\r\n";
      var idx = nextChunk(nextBoundary, 0) + nextBoundary.length; // skip preamble
      var last_idx;
      var siblings = [];
      var sibling = {};
      nextBoundary = "\r\n--"+boundary;
      for(;;) {
        // If a header
        if (prefixAt(idx, "\r\n") !== true) {
          last_idx = idx;
          idx = nextChunk(": ", last_idx);
    var hdr = text.substring(last_idx, idx);
          last_idx = idx + 2;
          idx = nextChunk("\r\n", last_idx);
          var val = text.substring(last_idx, idx);
          if (hdr === 'Content-Type') {
            sibling.contentType = val;
          } else if (hdr === 'Link') {
            sibling.linkHeader = val;
          }
          idx += 2;          
  } else { // Idx points to \r\n at end of headers, grab the body
          last_idx = idx + 2;
          idx = nextChunk(nextBoundary, last_idx + 2);
          sibling.body = text.substring(last_idx, idx);
          siblings.push(sibling);
          sibling = {};
          idx += nextBoundary.length;
          if (prefixAt(idx, "--\r\n")) // --boundary-- is the end of 
            break; 
          else if (prefixAt(idx, "\r\n"))
            idx += 2;
          else
            throw("Expecting boundary or end of multipart/mixed");
        }
      }
      return siblings;
    }
  };
}();

/**
 * Builds a map/reduce chain and executes it
 * @param client RiakClient object
 * @param bucketName Riak bucket name
 * @param key Riak bucket key (optional)
 */
function RiakMapper(client, bucketName, key) {
  if (bucketName === undefined ||
      client === undefined) {
    throw('Cannot construct RiakMapper without bucketName and client');
  }
  this.client = client;
  this.bucket = bucketName;
  this.key = key;
  this.phases = [];
}

/**
 * Add a map phase to a map/reduce job
 * @param options - Hash describing the map phase
 * @return RiakMapper instance for method chaining fun
 */
RiakMapper.prototype.map = function(options) {
  this.phases.push(this._buildPhase({map: null}, options));
  return this;
};

/**
 * Add a map phase to a map/reduce job
 * @param options - Hash describing the reduce phase
 * @return RiakMapper instance for method chaining fun
 */
RiakMapper.prototype.reduce = function(options) {
  this.phases.push(this._buildPhase({reduce: null}, options));
  return this;
};

/**
 * Add a link phase to a map/reduce job
 * @param options - Hash describing the link phase
 */
RiakMapper.prototype.link = function(options) {
  this.phases.push(this._buildPhase({link: null}, options));
  return this;
};

/**
 * Runs a map/reduce job
 * @param timeout - Job timeout (in milliseconds). Defaults to 60000
 * @param callback - Function to call when op completes
 *
 * callback - function(success, request, results)
 * @param success - Boolean indicating success or failure
 * @param results - JSON decoded results or null
 * @param request - XMLHttpRequest object
 */
RiakMapper.prototype.run = function(timeout, callback) {
  if (timeout === undefined || timeout === null) {
    timeout = 60000;
  }
  else if (typeof timeout === 'function') {
    callback = timeout;
    timeout = 60000;
  }
  var mapper = this;
  var job = {'inputs': this._buildInputs(),
       'query': this.phases,
       'timeout': timeout};
  jQuery.ajax({url: this.client.mapredUrl,
         type: 'POST',
         data: JSON.stringify(job),
         beforeSend: function(req) { req.setRequestHeader('X-Riak-ClientId', mapper.client.clientId); },
         complete: function(req, StatusText) { if (callback !== undefined) {
                   if (RiakUtil.wasSuccessful(req)) {
               callback(true, JSON.parse(req.responseText), req);
                   }
                   else {
               try {
                 var error = {error: JSON.parse(req.responseText)};
                 callback(false, error, req);
               }
               catch (e) {
                 callback(false, null, req);
               }
                   } } } });
};

/** Start RiakMapper internals **/
RiakMapper.prototype._buildPhase = function(starter, options) {
  if (typeof options.source === 'function') {
      source = options.source;
      try
      {
        /* Create a string with minimal padding - JSON.parse
         * does not like embedded newlines in strings
         * and function.toString() on FireFox (on 3.6.3) generates
         * a string with embedded newlines.
         */
        options.source = source.toString(-1);
      }
      catch (e)
      {
        options.source = source.toString();
      }
  }
  if ((starter.map === null ||
       starter.reduce === null) && (options.language === null || options.language === undefined)) {
    options.language = 'javascript';
  }
  if (starter.map === null) {
    starter.map = options;
  }
  else if (starter.reduce === null){
    starter.reduce = options;
  }
  else {
    if (options.bucket === null || options.bucket === undefined) {
      options.bucket = this.bucketName;
    }
    starter.link = options;
  }
  return starter;
};

RiakMapper.prototype._buildInputs = function() {
  if (this.key !== null && this.key !== undefined) {
    return [[this.bucket, this.key]];
  }
  else {
    return this.bucket;
  }
};
/** End RiakMapper internals **/

/**
 * Models an entry in a Riak bucket
 * @param bucketName - Riak bucket name
 * @param key - Object's key
 * @param client - Owning RiakClient
 * @param body - Object's data
 * @param contentType - Mime type associated with data
 * @param vclock - Riak-assigned vclock
 */
function RiakObject(bucketName, key, client, body, contentType, vclock) {
  if (client === undefined) {
    throw("Cannot construct RiakObject without a client reference");
  }
  this.bucket = bucketName;
  this.key = key;
  this.client = client;
  if (contentType === undefined) {
    this.contentType = 'application/octet-stream';
  }
  else {
    this.contentType = contentType;
  }
  if (contentType === 'application/json') {
    if (body !== undefined) {
      try {
        this.body = JSON.parse(body);
      }
      catch (err) {
        // the content type lied to us
        this.body = body;
      }
    }
    else {
      this.body = '';
    }
  }
  else {
    if (body === undefined) {
      this.body = '';
    }
    else {
      this.body = body;
    }
  }
  this.vclock = vclock;
  this.links = [];
}

/**
 * 'Hydrates' a RiakObject from a HTTP request
 * @param bucket - Riak bucket name
 * @param key - Riak bucket key
 * @param client - Owning RiakClient
 * @param req - XMLHttpRequest
 */
RiakObject.fromRequest = function(bucket, key, client, req) {
  var contentType = req.getResponseHeader('Content-Type');
  var vclock = req.getResponseHeader('X-Riak-Vclock');
  var linkHeader = req.getResponseHeader('Link');
  if (req.getResponseHeader('Location')) {
    key = req.getResponseHeader('Location').split('/').pop();
  }
  var body = req.responseText;
  var retval = new RiakObject(bucket, key, client, body, contentType, vclock);
  retval.setLinks(linkHeader);
  retval.etag = req.getResponseHeader('Etag');
  retval.lastModified = req.getResponseHeader('Last-Modified');

  all_headers = req.getAllResponseHeaders();
  retval.setIndexes(all_headers);
  return retval;
};

RiakObject.fromMultipart = function(bucket, key, client, vclock, multipartChunk) {
  var retval = new RiakObject(bucket, key, client, multipartChunk.body, multipartChunk.contentType, vclock);
  retval.setLinks(multipartChunk.linkHeader);
  return retval;
};

/**
 * Begins building a map/reduce job which will
 * use the current object as input
 * @param options - Hash description the map phase
 */
RiakObject.prototype.map = function(options) {
  var mapper = new RiakMapper(this.client, this.bucket, this.key);
  return mapper.map(options);
};

/**
 * Begins building a map/reduce job which will
 * use the current object as input
 * @param options - Hash description the reduce phase
 */
RiakObject.prototype.reduce = function(options) {
  var mapper = new RiakMapper(this.client, this.bucket, this.key);
  return mapper.reduce(options);
};

/**
 * Begins building a map/reduce job which will
 * use the current object as input
 * @param options - Hash description the link phase
 */
RiakObject.prototype.link = function(options) {
  var mapper = new RiakMapper(this.client, this.bucket, this.key);
  return mapper.link(options);
};

/**
 * Parses a raw link header and populates the links array
 * @param linkHeader - Raw link header string
 */
RiakObject.prototype.setLinks = function(linkHeader) {
  var parsedLinks = new Array();
  if (linkHeader !== '') {
    var links = linkHeader.split(",");
    for (var i = 0; i < links.length; i++) {
      var linkParts = links[i].split(';');
      var linkTag = RiakUtil.trim(linkParts[1]);
      var linkTo = RiakUtil.trim(linkParts[0].replace(/Link: ?/, ''));
      linkTo = linkTo.replace(/</, '').replace(/>/, '');
      linkTo = linkTo.replace(/\"/g, '');
      linkTag = linkTag.replace('riaktag=', '');
      linkTag = linkTag.replace(/\"/g, '');
      parsedLinks.push({tag: linkTag.toString(), target: linkTo.toString()});
    }
  }
  this.links = parsedLinks;
};

RiakObject.prototype.setIndexes = function(all_headers) {
  headers_by_line = all_headers.split('\n');
  results = {}
  for (i = 0; i < headers_by_line.length; i++) {
    if (headers_by_line[i].indexOf('x-riak-index-') == 0) {
      index = headers_by_line[i].split(':');
      k = index[0].substring('x-riak-index-'.length, index[0].length);
      v = index[1].trim();
      results[k] = v;
    }
  }
  this.indexes = results
};

/**
 * Retrieves the links collection
 * @return Array of link hashes (e.g. [{tag: 'userInfo', target: '/buckets/users/keys/bob'}])
 */
RiakObject.prototype.getLinks = function() {
  return this.links;
};

/**
 * Returns the links formatted for the Link header
 * @return - Link header string
 */
RiakObject.prototype.getLinkHeader = function() {
  if (this.links.length === 0) {
    return '';
  }
  var header = '';
  for (var i = 0; i < this.links.length; i++) {
      link = this.links[i];
      header = header + '<' + link.target + '>; ';
      if (link.tag === 'rel=up') {
    header = header + 'rel="up", ';
      }
      else {
    header = header + 'riaktag=\"' + link.tag + '\", ';
      }
  }
  header = header.replace(/\"\"/g, '\"');
  return header.replace(/,\s$/, '');
};

/**
 * Adds a link to the object's link collection
 * @param link - Pointer to other object (e.g. /buckets/foo/keys/bar)
 * @param tag - Tag for the link (e.g. 'userInfo')
 * @param noDuplicates - Toggle duplicate checking on/off
 * @return true if added, false otherwise
 */
RiakObject.prototype.addLink = function(link, tag, noDuplicates) {
  if (link.indexOf('/') == -1) {
    throw('Invalid link: ' + link);
  }
  var retval = true;
  if (noDuplicates === false || noDuplicates === undefined) {
    this.links.push({tag: tag, target:link});
  }
  else {
    var foundDuplicate = false;
    for (var i = 0; i < this.links.length; i++) {
      foundDuplicate = this.links[i].tag === tag &&
  this.links[i].target === link;
      if (foundDuplicate) {
  retval = false;
  break;
      }
    }
    if (!foundDuplicate) {
      this.links.push({tag: tag, target: link});
    }
  }
  return retval;
};

/**
 * Removes a link from the links collection based on
 * link and tag
 * @param link - Pointer to other object
 * @param tag - Tag for the link
 * @return true if link removed, false if not
 */
RiakObject.prototype.removeLink = function(link, tag) {
  var retval = false;
  var newLinks = this.links.filter(function(l) { return l.link !== link || l.tag !== tag; });
  if (newLinkes.length != this.links.length) {
    retval = true;
    this.links = newLinks;
  }
  return retval;
};

/**
 * Resets the links collection to an empty array
 */
RiakObject.prototype.clearLinks = function() {
  this.links = [];
};


/**
 * Deletes an object from a Riak bucket
 * @param callback - Function to call when op complete
 *
 * callback - function(success, request)
 * @param success - Boolean flag indicating successful removal
 * @param request - XMLHTTPRequest object
 */
RiakObject.prototype.remove = function(callback) {
  var object = this;
  jQuery.ajax({url: this.client._buildPath('DELETE', this.bucket, this.key),
         type: 'DELETE',
               accepts: RiakUtil.multipart_accepts(),
               dataType: 'multipart',
         beforeSend: function(req) { req.setRequestHeader('X-Riak-ClientId', object.client.clientId);
             if (object.vclock !== undefined && object.vclock !== null) {
               req.setRequestHeader('X-Riak-Vclock', object.vclock);
             }
           },
         complete: function(req, statusText) { if (callback !== undefined) {
                  if (RiakUtil.wasSuccessful(req)) {
              callback(true, req);
                   }
                   else {
               callback(false, req);
                   }
                 } }});
};

/**
 * Store the object in Riak
 * @param callback - Function to call when op completes
 *
 * callback - function(status, object, request)
 * @param status - 'status' of the result: 'ok', 'failed', or 'siblings'
 * @param object - If status is 'ok', object is an updated RiakObject instance
 *                 If status is 'siblings', object is an array of RiakObject instances
 *                 which the client can pick from to resolve the conflict
 *                 If status is 'failed', object is null
 *                 NOTE: Use the updated version to prevent siblings & vector clock explosion
 * @param request - XMLHttpRequest object
 */
RiakObject.prototype.store = function(callback) {
  if (this.contentType === null) {
    throw('RiakObject missing contentType');
  }
  var url, method;
  var object = this;
  var objectData = null;
  if (this.contentType === 'application/json') {
    if (this.body !== undefined && this.body !== null) {
      objectData = JSON.stringify(this.body);
    }
    else {
      objectData = this.body;
    }
  }
  else {
    objectData = this.body;
  }
  if (this.key === undefined || this.key === null) {
    url = this.client._buildPath('POST', this.bucket);
    method = 'POST';
  } else {
    url = this.client._buildPath('PUT', this.bucket, this.key);
    method = 'PUT';
  }
  jQuery.ajax({url: url,
    type: method,
    data: objectData,
    contentType: this.contentType,
          accepts: RiakUtil.multipart_accepts(),
          dataType: 'multipart',
    beforeSend: function(req) { req.setRequestHeader('X-Riak-ClientId', object.client.clientId);
              if (object.vclock !== undefined && object.vclock !== null) {
          req.setRequestHeader('X-Riak-Vclock', object.vclock);
              }
              var linkHeader = object.getLinkHeader();
              if (linkHeader !== '') {
          req.setRequestHeader('Link', linkHeader);
              }
            },
    complete: function(req, statusText) { object._store(req, callback); } });
};

/** Start RiakObject Internals **/
RiakObject.prototype._store = function(req, callback) {
  if (req.readyState != 4) {
    return;
  }
  if (callback !== undefined && callback !== null) {
    if (req.status == 200 || req.status == 201 || req.status == 204) {
      callback('ok', RiakObject.fromRequest(this.bucket, this.key, this.client, req), req);
    }
    /* Uh-oh, we've got siblings! */
    else if (req.status == 300) {
      var siblingData = RiakUtil.parseSiblings(req.getResponseHeader('Content-Type'),
                 req.responseText);
      var vclock = req.getResponseHeader('X-Riak-Vclock');
      var thisObject = this;
        var siblings = [];
      for (var i = 0; i < siblingData.length; i++) {
        var sd = siblingData[i];
        var sib = RiakObject.fromMultipart(thisObject.bucket, thisObject.key, 
                                           thisObject.client, vclock, sd);
        siblings.push(sib);
      }
      callback('siblings', siblings, req);
    }
    else {
      callback('failed', null, req);
    }
  }
};

/** End RiakObject Internals **/

/**
 * Models a Riak bucket
 * @param bucket - Riak bucket name
 * @param client - RiakClient reference
 */
function RiakBucket(bucket, client, props) {
  if (client === undefined) {
    throw("Cannot construct RiakBucket without client reference");
  }
  this.name = bucket;
  this.client = client;
  if (props === undefined) {
    this.props = {};
  }
  else {
    this.props = props.props;
  }
}

/**
 * "Hydrates" a RiakBucket from a HTTP request
 * @param bucketName - Riak bucket name (duh!)
 * @param client - RiakClient object
 * @param req - Active XMLHttpRequest object
 * @return populated RiakBucket instance
 */
RiakBucket.fromRequest = function(bucketName, client, req) {
  var props = JSON.parse(req.responseText);
  return new RiakBucket(bucketName, client, props);
};

/**
 * Gets the keys for a bucket, currently only uses keys=true
 * and doesn't support streaming keys.
 * @param callback function
 * callback - function(keys)
 * @param keys Array
 */
RiakBucket.prototype.keys = function(callback) {
  jQuery.getJSON(this.client.baseUrl + "/" + this.name + "/keys?keys=true", function(data){
    callback(data.keys);
  });
};

/**
 * Gets the bucket's props and sets it on the bucket instance
 * @param callback function
 * callback - function(props)
 * @param props Hash
 */
RiakBucket.prototype.getProps = function(callback) {
  bucket = this;
  jQuery.getJSON(this.client.baseUrl + "/" + this.name + "/props", function(data){
    bucket.props = data.props;
    callback(data.props);
  });
};

/**
 * Begins building a map/reduce job which will
 * use the entire bucket contents as input
 * @param options - Hash description the map phase
 * @return RiakMapper object
 */
RiakBucket.prototype.map = function(options) {
  var mapper = new RiakMapper(this.client, this.name);
  return mapper.map(options);
};

/**
 * Begins building a map/reduce job which will
 * use the entire bucket contents as input
 * @param options - Hash description the reduce phase
 * @return RiakMapper object
 */
RiakBucket.prototype.reduce = function(options) {
  var mapper = new RiakMapper(this.client, this.name);
  return mapper.reduce(options);
};

/**
 * Begins building a map/reduce job which will
 * use the entire bucket contents as input
 * @param options - Hash description the link phase
 * @return RiakMapper object
 */
RiakBucket.prototype.link = function(options) {
  var mapper = new RiakMapper(this.client, this.name);
  options.bucket = this.name;
  return mapper.link(options);
};

/**
 * Sets/gets the nValue for this bucket
 * @param n -- New nValue (optional)
 * @return the current nValue
 */
RiakBucket.prototype.nValue = function(n) {
  var retval = this.props.n_val;
  if (n !== undefined) {
    this.props.n_val = n;
    retval = n;
  }
  return retval;
};

/**
 * Enables/disables multiple bucket entries
 * @param flag -- true or false
 * @return the current setting
 */
RiakBucket.prototype.allowsMultiples = function(flag) {
  var retval = this.props.allow_mult;
  if (flag !== undefined) {
    this.props.allow_mult = flag;
    retval = flag;
  }
  return retval;
};

/**
 * Stores bucket
 * @param callback - Function to call when op has completed
 *
 * callback - function(bucket, request)
 * @param bucket - Updated bucket or null if store failed
 * @param request - XMLHTTPRequest object
 */
RiakBucket.prototype.store = function(callback) {
  var bucket = this;
  var currentProps = {};
  currentProps.props = this.props;
  jQuery.ajax({url: this.client._buildPath('PUT', this.name),
    type: 'PUT',
    data: JSON.stringify(currentProps),
    contentType: 'application/json',
    dataType: 'text',
    beforeSend: function(req) { 
              req.setRequestHeader('X-Riak-ClientId', bucket.client.clientId);
          },
    complete: function(req, statusText) { bucket._store(req, callback); } });
};

/**
 * Fetch an entry from the bucket
 * @param key - Riak bucket key
 * @param callback - Function to call when op has completed
 *
 * callback - function(status, object, request)
 * @param status - text status
 * @param object - RiakObject if found, otherwise null
 * @param request - XMLHTTPRequest object
 */
RiakBucket.prototype.get = function(key, callback) {
  var bucket = this;
  jQuery.ajax({url: this.client._buildPath('GET', this.name, key),
    type: 'GET',
          accepts: RiakUtil.multipart_accepts(),
          dataType: 'multipart',
    beforeSend: function(req) {
              req.setRequestHeader('X-Riak-ClientId', bucket.client.clientId);
          },
    complete: function(req, statusText) { bucket._handleGetObject(key, req, callback, false); } });
};

/**
 * Fetch an entry from the bucket or create a new one
 * if not found
 * @param key - Riak bucket key
 * @param callback - Function to call when op has completed
 *
 * callback - function(object, request)
 * @param object - RiakObject instance
 * @param request - XMLHTTPRequest object
 */
RiakBucket.prototype.get_or_new = function(key, callback) {
  var bucket = this;
  jQuery.ajax({url: this.client._buildPath('GET', this.name, key),
    type: 'GET',
          accepts: RiakUtil.multipart_accepts(),
          dataType: 'multipart',
    beforeSend: function(req) {
              req.setRequestHeader('X-Riak-ClientId', bucket.client.clientId);
          },
    complete: function(req, statusText) { bucket._handleGetObject(key, req, callback, true); } });
};

/**
 * Deletes an object from a Riak bucket
 * @param key - Riak bucket key
 * @param callback - Function to call when op complete
 *
 * callback - function(success, request)
 * @param success - Boolean flag indicating successful removal
 * @param request - XMLHTTPRequest object
 */
RiakBucket.prototype.remove = function(key, callback) {
  var bucket = this;
  jQuery.ajax({url: this.client._buildPath('DELETE', bucket.name, key),
         type: 'DELETE',
               accepts: RiakUtil.multipart_accepts(),
               dataType: 'multipart',
         beforeSend: function(req) { req.setRequestHeader('X-Riak-ClientId', bucket.client.clientId);
             if (bucket.vclock !== undefined && bucket.vclock !== null) {
               req.setRequestHeader('X-Riak-Vclock', bucket.vclock);
             }
           },
         complete: function(req, statusText) { if (callback !== undefined) {
                  if (RiakUtil.wasSuccessful(req)) {
              callback(true, req);
                   }
                   else {
               callback(false, req);
                   }
                 } }});
};

/** Start RiakBucket internals **/

RiakBucket.prototype._store = function(req, callback) {
  if (req.readyState != 4) {
    return;
  }
  if (callback !== undefined) {
    if (req.status == 204) {
      this.client.bucket(this.name, callback);
    }
    else {
      callback(null, req);
    }
  }
};

RiakBucket.prototype._handleGetObject = function(key, req, callback, createEmpty) {
  if (req.readyState != 4) {
    return;
  }
  var status = 'failed';
  var object = null;
  if (callback !== null && callback !== undefined) {
    if (req.status == 200) {
      status = 'ok';
      object = RiakObject.fromRequest(this.name, key, this.client, req);
    }
    else if ((req.status === 0 || req.status === 404))
    {
      if (createEmpty === true) {
        status = 'ok';
        object = new RiakObject(this.name, key, this.client);
      }
      /* must not create empty return failed/null */
    }
    /* Uh-oh, we've got siblings! */
    else if (req.status == 300) {
      var siblingData = RiakUtil.parseSiblings(req.getResponseHeader('Content-Type'),
                 req.responseText);
      var vclock = req.getResponseHeader('X-Riak-Vclock');
      var thisBucket = this;
      var siblings = [];
      for (var i = 0; i < siblingData.length; i++) {
        var sd = siblingData[i];
        var sib = RiakObject.fromMultipart(thisBucket.name, key, 
                                           thisBucket.client, vclock, sd);
        siblings.push(sib);
      }
      status = 'siblings';
      object = siblings;
    }
    callback(status, object, req);
  }
};

/** End RiakBucket internals **/


/**
 * Entry point for interacting with Riak
 * @param baseUrl - URL for 'raw' interface (optional, default: '/buckets')
 * @param mapredUrl - URL for map/reduce jobs (optional, default: '/mapred')
 */
function RiakClient(baseUrl, mapredUrl) {
  if (baseUrl === undefined) {
    baseUrl = '/buckets';
  }
  else {
    if (baseUrl[0] !== '/') {
      baseUrl = '/' + baseUrl;
    }
    if ((baseUrl.slice(-1) !== '/')) {
      baseUrl += '/';
    }
  }
  this.baseUrl = baseUrl;
  this.clientId = "js_" + RiakUtil.base64Encode(Math.floor(Math.random() * 4294967296));

  if (mapredUrl !== undefined) {
    this.mapredUrl = mapredUrl;
  }
  else {
    this.mapredUrl = '/mapred';
  }
}

/**
 * Fetches a bucket from Riak
 * Buckets *always* exist so no need to handle
 * @param bucket Riak bucket name
 * @param callback Function to call when op completes
 *
 * callback - function(bucket, request)
 * @param bucket - RiakBucket instance
 * @param request - XMLHTTPRequest object
 */
RiakClient.prototype.bucket = function(bucket, callback) {
  var client = this;
  jQuery.ajax({url: this._buildPath('GET', bucket),
    type: 'GET',
    contentType: 'application/json',
    dataType: 'text',
    beforeSend: function(req) { 
              req.setRequestHeader('X-Riak-ClientId', this.clientId);
          },
    complete: function(req, statusText) { client._handleGetBucket(bucket, req, callback, false); } });
};

/** 
* Fetches all buckets from a node
* @param callback Function to call when op completes 
*/
RiakClient.prototype.buckets = function(callback) {
  var client = this;
  jQuery.ajax({url: this.baseUrl + '?buckets=true',
    type: 'GET',
    contentType: 'application/json',
    dataType: 'json',
    beforeSend: function(req) {
      req.setRequestHeader('X-Riak-ClientId', this.clientId);
    },
    success:function(data, status, jqXHR) { client._handleGetBuckets(data, callback); } });
};

RiakClient.prototype._handleGetBuckets = function(data, callback) {
  if ( callback === undefined) { return; } 
  var buckets = [];
  if (data.buckets !== undefined) {
    buckets = data.buckets;
  }
  callback(buckets);
};

/** Begin RiakClient internal functions **/
RiakClient.prototype._handleGetBucket = function(bucketName, req, callback, createEmpty) {
  var bucket = null;
  if (req.readyState != 4) {
    return;
  }
  if (callback !== undefined) {
    if (req.status == 200) {
      bucket = RiakBucket.fromRequest(bucketName, this, req);
    }
    callback(bucket, req);
  }
};

RiakClient.prototype._buildPath = function(method, bucket, key) {
  var path = this.baseUrl + "/" + bucket
  /* Reluctantly adding a cache breaker to each request.  FireFox
  ** sometimes caches XHR responses which triggers failures in the
  ** unit tests (and presumably real code).  See 'bypassing the cache'
  ** in https://developer-stage.mozilla.org/En/Using_XMLHttpRequest
  */
  var cache_breaker = Math.floor(Math.random() * 4294967296).toString();
  if (key !== undefined) {
    path = path + '/keys/' + key + "?" + cache_breaker;
    if (method === 'PUT') {
      path = path + '&returnbody=true';
    }
  }
  else {
    path = path + "/keys?" + cache_breaker;
    if (method === 'GET') {
      path = path + '&keys=false';
    }
    else if (method === 'POST') {
      path = path + '&returnbody=true';
    }
  }
  return path;
};

/** End RiakClient internal Functions **/
