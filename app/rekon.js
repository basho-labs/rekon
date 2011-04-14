rekonApp = Sammy('#container', function(){

  $container = $(this.$element);

  this.use('Template');

  setHeader = function(header, url) {
    $container.find('h1').html(header + " &ndash; <em> " + url + "</em>");
  };

  setupContent = function(selector) {
    var tbody = $(selector).find('table tbody');
    $('#footer-navi li:not(:first)').remove();
    $('.screen').hide();
    $(selector).show();
    tbody.html('');
    return tbody;
  };

  breadcrumb = function(crumb) {
    $('<li>').append(crumb).appendTo('ul#footer-navi');
  };

  this.get('#/buckets', function(context){
    setHeader('Buckets', Rekon.baseUrl());
    var tbody = setupContent('#buckets');
    
    Rekon.client.buckets(function(buckets) {
      $.each(buckets, function(i, bucket) {
        context.render('bucket.html.template', {bucket: bucket}).appendTo(tbody);
      });
    });

    breadcrumb($('<a>').attr('href', '#').addClass('action').text('Reload Buckets'));
  });

  this.get('#/buckets/:bucket', function(context){
    /* setup */
    var name   = this.params['bucket'];
    var tbody  = setupContent('#bucket');
    var bucket = new RiakBucket(name, Rekon.client);
    setHeader('Bucket', Rekon.riakUrl(name));

    bucket.keys(function(keys) {
      $.each(keys, function(i, key) {
        context.render('key.html.template', {bucket: name, key: key}).appendTo(tbody);
      });
    });
  });

  this.get('#/buckets/:bucket/:key', function(context) {
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
