#!/bin/sh

# Allow overriding the target install node
if [ -z "$node" ] ; then
  node='127.0.0.1:8098'
fi

echo
echo "Begining Install into $node..."
echo "Downloading Rekon from Github"

# Download the github tarbal to the /tmp directory
curl -L -s https://github.com/adamhunter/rekon/tarball/master > /tmp/rekon.tar.gz

echo
echo "Download Completed"
echo "Extracting Source"

# Clean up from previously installed versions
rm -rf /tmp/extract-rekon /tmp/rekon

# Setup directories for extraction and running installer
mkdir /tmp/extract-rekon /tmp/rekon

# Unzip rekon into extraction directory
tar xzf /tmp/rekon.tar.gz -C /tmp/extract-rekon

# Move crazy gitub adamhunter-sha directory to standardized path
mv -f /tmp/extract-rekon/*/* /tmp/rekon/

# Enable execution bit for install script
chmod u+x /tmp/rekon/install.sh

# Run downloaded installer script
/tmp/rekon/install.sh $node;

# Clean up after the install
rm -rf /tmp/extract-rekon /tmp/rekon

echo
echo "Install Completed!"

if [ $OSTYPE == 'darwin10.0' ]; then
  # if we are macking OSX, use open to take the user to rekon
  echo "Opening http://$node/riak/rekon/go#/buckets"
  open "http://$node/riak/rekon/go#/buckets"
else
  echo
  echo "************************************************"
  echo "Visit http://$node/riak/rekon/go in your browser"
  echo "************************************************"
fi

# Lets get a newline before we return to the prompt
echo
