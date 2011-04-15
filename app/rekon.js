rekonApp = Sammy('#container', function(){

  this.use('Template');

  this.before(function(){
    $('#main').empty();
    $('#content h1').html('');
    $('#footer-navi li:not(:first)').remove();
  });

  $container = $(this.$element);

  header = function(header, url) {
    $container.find('h1').html(header + " &ndash; <em> " + url + "</em>");
  };

  breadcrumb = function(crumb) {
    $('<li>').append(crumb).appendTo('ul#footer-navi');
  };

  this.get('#/buckets', function(context){
    header('Buckets', Rekon.baseUrl());
    breadcrumb($('<a>').attr('href', '#').addClass('action').text('Reload Buckets'));

    context.render('buckets.html.template').appendTo('#main');
    
    Rekon.client.buckets(function(buckets) {
      $.each(buckets, function(i, bucket) {
        context.render('bucket-row.html.template', {bucket: bucket}).appendTo('#buckets tbody');
      });
    });
  });

  this.get('#/buckets/:bucket', function(context){
    var name   = this.params['bucket'];
    var bucket = new RiakBucket(name, Rekon.client);
    
    header('Bucket', Rekon.riakUrl(name));

    context.render('bucket.html.template').appendTo('#main');

    bucket.keys(function(keys) {
      $.each(keys, function(i, key) {
        context.render('key-row.html.template', {bucket: name, key: key}).appendTo('#keys tbody');
      });
    });

    bucket.getProps(function(props) {
      var pre_commit, post_commit;
      pre_commit  = props.precommit.join(",");
      post_commit = props.postcommit.join(",");
      if(pre_commit === "") {pre_commit = "None";}
      if(post_commit === "") {post_commit = "None";}
      context.render('bucket-hooks.html.template', {pre_commit: pre_commit, post_commit: post_commit}).appendTo('#bucket');
      context.render('bucket-props.html.template', {props: props}).appendTo('#bucket');
    });
  });

  this.get('#/buckets/:bucket/:key', function(context) {
    var name   = this.params['bucket'];
    var key    = this.params['key'];
    var bucket = new RiakBucket(name, Rekon.client);
    
    header('Key', Rekon.riakUrl(name + '/' + key));
    breadcrumb($('<a>').attr('href', '#/buckets/' + name).text('Keys'));

    context.render('key.html.template').appendTo('#main');

    bucket.get(key, function(status, object) {
      context.render('key-table.html.template', {object: object}).appendTo('#key tbody');
    });
  });

});

Rekon = {
  client : new RiakClient(),

  baseUrl : function() {
    return document.location.origin + this.client.baseUrl;
  },

  riakUrl : function(append) {
    if (append === undefined) {
      append = "";
    }
    return this.baseUrl() + append;
  }

};

/*
* Bootstrap the application
*/
jQuery(function($) {
  rekonApp.run('#/buckets');
});
