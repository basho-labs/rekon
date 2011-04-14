#!/bin/sh

if [ -n "$1" ] ; then
  node=$1
else
  node="127.0.0.1:8098"
fi

riak_url="http://$node/riak/rekon"

echo "Installing rekon to $node..."

for f in $(ls app); do
  echo "Uploading $f to riak"
  case $f in
    *.js )
      content_type="application/javascript"
      ;;
    *.html )
      content_type="text/html"
      ;;
    *.css )
      content_type="text/css"
      ;;
    *.png )
      content_type="image/png"
      ;;
    *.template )
      content_type="application/x-sammy-template"
      ;;
  esac

  curl -X PUT -H"Content-Type: $content_type" $riak_url/$f --data-binary @app/$f
done
