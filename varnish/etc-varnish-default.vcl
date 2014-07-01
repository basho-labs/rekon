# This is a basic VCL configuration file for varnish.  See the vcl(7)
# man page for details on VCL syntax and semantics.
# 
# Default backend definition.  Set this to point to your content
# server.
 
backend riak1 {
    .host = "127.0.0.1";
    .port = "8098";

    # bucket and key listings are heavy/slow operations, lets not 503s them
    .first_byte_timeout = 300s;
}

#backend riak2 {
#    .host = "127.0.0.2";
#    .port = "8098";
#    .first_byte_timeout = 300s;
#}

#backend riak3 {
#    .host = "127.0.0.3";
#    .port = "8098";
#    .first_byte_timeout = 300s;
#}

#backend riak4 {
#    .host = "127.0.0.4";
#    .port = "8098";
#    .first_byte_timeout = 300s;
#}

#backend riak5 {
#    .host = "127.0.0.5";
#    .port = "8098";
#    .first_byte_timeout = 300s;
#}

director default hash {

      {
              .backend = riak1;
              .weight = 1;
      }

#      {
#              .backend = riak2;
#              .weight = 1;
#      }

#      {
#              .backend = riak3;
#              .weight = 1;
#      }

#      {
#              .backend = riak4;
#              .weight = 1;
#      }

#      {
#              .backend = riak5;
#              .weight = 1;
#      }
}


sub vcl_fetch {

	# cache buckets=true URIs for 1 week

     	if (req.url ~ "buckets\?buckets=true$") {
     		/* Remove Expires from backend, it's not long enough */
             	unset beresp.http.expires;

        	/* Set the clients TTL on this object */
                set beresp.http.cache-control = "max-age=900";

                /* Set how long Varnish will keep it */
                set beresp.ttl = 1w;

                /* marker for vcl_deliver to reset Age: */
                set beresp.http.magicmarker = "1";
        }

	# cache keys=true URIs for 1 day

        if (req.url ~ "keys\?keys=true$") {
                /* Remove Expires from backend, it's not long enough */
                unset beresp.http.expires;

                /* Set the clients TTL on this object */
                set beresp.http.cache-control = "max-age=90";

                /* Set how long Varnish will keep it */
                set beresp.ttl = 1d;

                /* marker for vcl_deliver to reset Age: */
                set beresp.http.magicmarker = "1";
        }
}

sub vcl_deliver {
        if (resp.http.magicmarker) {
                /* Remove the magic marker */
                unset resp.http.magicmarker;

                /* By definition we have a fresh object */
                set resp.http.age = "0";
        }

	# add HIT/MISS markers to help with troubleshooting

	if (obj.hits > 0) {
        	set resp.http.X-Cache = "HIT";
	} else {
        	set resp.http.X-Cache = "MISS";
	}
}
