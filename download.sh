echo
echo "Begining Install..."
echo "Downloading Rekon"
curl -L -s https://github.com/adamhunter/rekon/tarball/master > /tmp/rekon.tar.gz
echo
echo "Download Completed"
echo "Extracting Source"
rm -rf /tmp/extract-rekon /tmp/rekon
mkdir /tmp/extract-rekon /tmp/rekon
tar xzf /tmp/rekon.tar.gz -C /tmp/extract-rekon
mv -f /tmp/extract-rekon/*/* /tmp/rekon/
echo
cd /tmp/rekon
/tmp/rekon/install.sh
cd -
echo
echo "Install Completed!"
if [ $OSTYPE == 'darwin10.0' ]; then
  echo "Opening http://127.0.0.1:8098/riak/rekon/go#/buckets"
  open "http://127.0.0.1:8098/riak/rekon/go#/buckets"
else
  echo
  echo "Visit http://127.0.0.1:8098/riak/rekon/go in your browser"
fi
