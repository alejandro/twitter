#! /usr/bin/env node
var Hook = require('hook.io').Hook;

var twitobj = require('twitter')    

var twitter = new Hook( {
  name: 'twitter'
});

twitter.connect();


twitter.on('ready', function(){
  
  var twitterConnection = new twitobj({
    "consumer_key" : "",
    "consumer_secret" : "",
    "access_token_key" : "",
    "access_token_secret" : ""
  }); 
  
  console.log("info: attempting connection to Twitter stream API...".grey)
  twitterConnection.stream('statuses/filter', { track:['love'] }, function(stream) {
    console.log("info: connection successful.  Awaiting tweets...".green)
    stream.on('data', function (data) {
      var tweetURL = "http://twitter.com/#!/"+data.user.screen_name+"/status/"+data.id_str;
      var tweetMsg = "@" + data.user.screen_name + " " + data.text;
      //tweetMsg = tweetMsg.replace(/\r/g, ' ').replace(/\n/g, ' ').replace(/&gt;/g, '>').replace(/&lt;/g, '<');
      
      twitter.emit('out.tweet', tweetMsg)
      console.log(tweetMsg);
    });
  });
  
  
});



