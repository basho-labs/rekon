#!/bin/sh

if [ -n "$1" ] ; then
  node=$1
else
  node="127.0.0.1:8098"
fi

echo "Installing rekon to $node..."

for f in $(ls app); do
  echo "Uploading $f to riak"
  if [[ $f == *.js ]]
    curl -X POST -H "content-type:application/javascript" http://$node/riak/rekon_app/$f --data @app/$f
  elif [[ $f == *.html ]]
    curl -X POST -H "content-type:text/html" http://$node/riak/rekon_app/$f --data @app/$f
  elif [[ $f == *.css ]]
    curl -X POST -H "content-type:text/css" http://$node/riak/rekon_app/$f --data @app/$f
done
