#!/bin/sh

# Allow running the script and specifiying an install target
#   ./install node-address:host
if [ -n "$1" ] ; then
  node=$1
else
  node="127.0.0.1:8098"
fi

riak_url="http://$node/riak/rekon"

echo "Installing rekon to $node..."

base_dir="`dirname $0`/app"

# loop through everything in the app directory and put in in the rekon bucket
for f in $(ls $base_dir); do
  # echo "Uploading $f to riak"
  case $f in
    go | *.html )
      content_type="text/html"
      ;;
    *.js )
      content_type="application/javascript"
      ;;
    *.css )
      content_type="text/css"
      ;;
    *.png )
      content_type="image/png"
      ;;
    *.gif )
      content_type="image/gif"
      ;;
    *.template )
      content_type="application/x-sammy-template"
      ;;
  esac

  curl -X PUT -H"Content-Type: $content_type" $riak_url/$f --data-binary @$base_dir/$f
done

echo "Installed, now visit: $riak_url/go"
