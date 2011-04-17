rekonApp = Sammy('#container', function(){

  $container = $(this.$element);

  header = function(header, url) {
    $container.find('h1').html(header + " &ndash; <em> " + url + "</em>");
  };

  breadcrumb = function(crumb) {
    $('<li>').append(crumb).appendTo('ul#footer-navi');
  };

  searchable = function(selector) {
    $('#row_search').quicksearch(selector, {selector: 'th'});
  };
  
  this.use('Template');

  this.before(function(){
    $('#main').empty();
    $('#content h1').html('');
    $('#footer-navi li:not(.perm)').remove();
  });

  this.get('#/buckets', function(context){
    header('Buckets', Rekon.baseUrl());

    context.render('buckets.html.template').appendTo('#main');
    
    Rekon.client.buckets(function(buckets) {
      bucketRows = buckets.map(function(bucket){ return {bucket: bucket};});
      context.renderEach('bucket-row.html.template', bucketRows).replace('#buckets tbody').then(
        function(){ searchable('#buckets table tbody tr'); }
      );
    });
  });

  this.post('#/buckets', function(context) {
    var name = this.params['bucket'];
    this.redirect('#/buckets/' + name);
  });

  this.get('#/buckets/:bucket', function(context){
    var name   = this.params['bucket'];
    var bucket = new RiakBucket(name, Rekon.client);
    
    header('Bucket', Rekon.riakUrl(name));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name + '/props').text('Props'));
    breadcrumb($('<a>').attr('href', Rekon.riakUrl(name)).attr('target', '_blank').text('Riak').addClass('action'));

    context.render('bucket.html.template', {bucket: name}).appendTo('#main');

    bucket.keys(function(keys) {
      if (keys.length > 0) {
        keyRows = keys.map(function(key) { return {bucket:name, key:key}; });
        context.renderEach('key-row.html.template', keyRows).replace('#keys tbody').then(
          function(){ searchable('#bucket table tbody tr'); }
        );
      } else {
        context.render('bucket-empty.html.template').replace('#keys tbody');
      }
    });
  });

  this.post('#/buckets/:bucket', function(context){
    var app    = this;
    var name   = this.params['bucket'];
    var key    = this.params['key'] === '' ? undefined : this.params['key'];
    var object = new RiakObject(name, key, Rekon.client, '{}', 'application/json');
    object.store(function(status, rObject){
      switch(status) {
      case 'siblings':
        alert("Oh noes! Siblings have been born and Rekon doesn't handle that yet.");
        break;
      case 'failure':
        alert("There was an error creating a new Riak object.");
        break;
      case 'ok':
      default:
        console.log(rObject);
        app.redirect('#/buckets/' + name + '/' + rObject.key);
        break;
      }
    });
  });

  this.get('#/buckets/:bucket/props', function(context) {
    var name   = this.params['bucket'];
    var bucket = new RiakBucket(name, Rekon.client);

    header('Bucket Properties', Rekon.riakUrl(name));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name).text('Keys'));
    breadcrumb($('<a>').attr('href', Rekon.riakUrl(name)).attr('target', '_blank').text('Riak').addClass('action'));

    bucket.getProps(function(props) {
      var pre_commit, post_commit;
      pre_commit  = props.precommit.join(",");
      post_commit = props.postcommit.join(",");
      if(pre_commit === "") {pre_commit = "None";}
      if(post_commit === "") {post_commit = "None";}
      context.render('bucket-hooks.html.template', {pre_commit: pre_commit, post_commit: post_commit},
        function(){
          context.render('bucket-props.html.template', {props: props}).appendTo('#main');
        }
      ).appendTo('#main');
    });
  });

  this.get('#/buckets/:bucket/:key', function(context) {
    var name   = this.params['bucket'];
    var key    = this.params['key'];
    var bucket = new RiakBucket(name, Rekon.client);

    header('Key', Rekon.riakUrl(name + '/' + key));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name).text('Keys'));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name + '/' + key + '/edit').text('Edit').addClass('action'));
    breadcrumb($('<a>').attr('href', Rekon.riakUrl(name + '/' + key)).attr('target', '_blank').
      text('Riak').addClass('action'));

    context.render('key.html.template').appendTo('#main');

    bucket.get(key, function(status, object) {
      context.render('key-content-type.html.template', {object: object}, function(){
        context.render('key-meta.html.template', {object: object}).appendTo('#key tbody');
      }).appendTo('#key tbody');

      switch(object.contentType) {
      case 'image/png':
      case 'image/jpeg':
      case 'image/jpg':
      case 'image/gif':
        context.render('value-image.html.template', {bucket: name, key: key}).appendTo('#value');
        return;
      case 'application/json':
        value = JSON.stringify(object.body, null, 4);
        break;
      default:
        value = object.body;
        break;
      }
      context.render('value-pre.html.template', {value: value}).appendTo('#value');
    });
  });

  this.get('#/buckets/:bucket/:key/edit', function(context) {
    var name   = this.params['bucket'];
    var key    = this.params['key'];
    var bucket = new RiakBucket(name, Rekon.client);
    var app    = this;

    header('Edit Key', Rekon.riakUrl(name + '/' + key));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name).text('Keys'));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name + '/' + key).text('View').addClass('action'));
    breadcrumb($('<a>').attr('href', Rekon.riakUrl(name + '/' + key)).attr('target', '_blank').
      text('Riak').addClass('action'));

    context.render('edit-key.html.template', {bucket: name, key: key}).appendTo('#main');

    bucket.get(key, function(status, object) {
      switch(object.contentType) {
      case 'image/png':
      case 'image/jpeg':
      case 'image/jpg':
      case 'image/gif':
        alert('Image editing is not supported currently.');
        app.redirect('#/buckets/' + name + '/' + key);
        return;
      case 'application/json':
        value = JSON.stringify(object.body, null, 4);
        break;
      default:
        value = object.body;
        break;
      }
      context.render('edit-key-content-type.html.template', {object: object}, function(html){
        context.render('key-meta.html.template', {object: object}).appendTo('#edit-key tbody');
      }).appendTo('#edit-key tbody').then(function(html){
        $select = $('select[name=content-type]');
        $select.val(object.contentType);
      });
      context.render('edit-value.html.template', {value: value}).appendTo('#edit-value');
    });
  });

  this.post('#/buckets/:bucket/:key', function(context){ 
    var app    = this;
    var name   = this.params['bucket'];
    var key    = this.params['key'];
    var bucket = new RiakBucket(name, Rekon.client);

    bucket.get(key, function(status, object) {
      object.contentType = app.params['content-type'];
      object.body        = app.params['value'];

      if (object.contentType == 'application/json') {
        object.body = JSON.parse(object.body);
      }

      object.store(function(status, rObject) {
        switch(status) {
        case 'siblings':
          alert("Oh noes! Siblings have been born and Rekon doesn't handle that yet.");
          break;
        case 'failure':
          alert("There was an error saving to Riak.");
          break;
        case 'ok':
        default:
          app.redirect('#/buckets/' + name + '/' + key);
          break;
        }
      });
    });
  });

  this.get('#/stats', function(context){
    header('Node Stats', document.location.origin + "/stats");

    $.getJSON('/stats', function(data) {
      context.render('stats.html.template', {stats:data}).appendTo('#main').then(
        function(){ searchable('#stats tbody tr'); }
      );
    });
  });

});

Rekon = {
  client : new RiakClient(),

  baseUrl : function() {
    return document.location.protocol + '//' + document.location.host + this.client.baseUrl;
  },

  riakUrl : function(append) {
    if (append === undefined) {
      append = "";
    }
    return this.baseUrl() + append;
  }

};

$('#keys a.delete').live('click', function(e){
  var link = this;
  e.preventDefault();
  if(!confirm("Are you sure you want to delete:\n" + $(link).attr('href'))) { return; }

  $.ajax({
    type: 'DELETE',
    url: $(link).attr('href')
  }).success(function(){
    $(link).closest('tr').remove();
  }).error(function(){
    alert('There was an error deleting this object from Riak.');
  });
});


/*
* Bootstrap the application
*/
jQuery(function($) {
  rekonApp.run('#/buckets');

});
