var Hook = require('hook.io').Hook,
    TwitObj = require('ntwitter'),
    Levenshtein = require('levenshtein'),
    colors = require('colors'),
    prompt = require('prompt'),
    util = require('util'),
    LanguageDetect = require('languagedetect'),
    detector = new LanguageDetect();    

var Twitter = exports.Twitter = function(options) {

  Hook.call(this, options);
  var self = this;
  self.on('hook::ready', function () {
    var twitCreds = self.config.get('auth:twitter');
    self._checkBitly(self.config.get('auth:bitly'));
    self.twitConn = new TwitObj(twitCreds);
    self.recentTweets = self.config.get('recentTweets');
    self.verify(function (err) {
      if (err) {
        self.emit('error::twitterCreds', err.message);
        return;
      }
      self.twitOptions = {
        track: self.track,
        follow: self.twitterID
      };
      self.startStream(self.twitMethod, self.twitOptions);
    });
  });
}
util.inherits(Twitter, Hook);

// These methods initialize various useful things.
Twitter.prototype._initShell = function () {
  prompt.start();
  prompt.pause();
  prompt.message = 'Hook.io-Twitter'.blue.bold;
  prompt.delimiter = '>'.red.bold;
  this.startShell();
}

Twitter.prototype._checkBitly = function (auth) {
  if (!auth) { 
    this.emit('error::bitlyCreds', 'No bit.ly API key provided, disabling shortlinks to tweets.');
    this.bitly = false;
    return; 
  }
  var Bitly = require('bitly').Bitly;
  this.bitly = new Bitly(auth.user, auth.key);
}

Twitter.prototype.verify = function (cb) {
  var self = this;
  self.twitConn.verifyCredentials(function (err, data) {
    if (err) { return cb(err) }
    self.twitterID = data.id;
    self.screenName = data.screen_name;
    self.emit('twitter::verified', 'Twitter Credentials Accepted!');
    cb(null);
  });
}

Twitter.prototype.startStream = function () {
  var self = this;
  if (self.twitConn.activeStream) { 
    self.emit('error::duplicateStream' ,'Stream already active.');
    return; 
  }
  self.emit('connecting' ,'info: attempting connection to Twitter stream API...')
  self.twitConn.stream(
    self.twitMethod, 
    {
      track: self.twitOptions.track, 
      follow: self.twitOptions.following
    }, 
    function (stream) {
      stream.on('data', function (data) {
        self.checkTweet(data);
      });
      stream.on('error', function (error) {
        console.log(error.stack);
      });
      self.twitConn.activeStream = stream;
      self.streamSuccess();
    }
  );
}

Twitter.prototype.streamSuccess = function () {
  this.emit('twitter::connected' ,'Streaming connection to Twitter established.');
  if (this.shell) { this._initShell(); }
  this._initHook();
}

Twitter.prototype.stopStream = function () {
  this.emit('streamDestroy', 'Ending streaming connection to Twitter.');
  this.twitConn.activeStream.destroy();
  this.twitConn.activeStream = null;
}

// The Tweet Chain: a chain of methods to analyze incoming tweets.

// First check the basic validity of the tweet; if it's valid and an @reply to
// the current user, keep it directly.  If not an @reply, go to the next step in the chain.
Twitter.prototype.checkTweet = function (data) {
  if ((data.text)
      &&((!(/.*\bRT:?.*/i).test(data.text))
      &&(!data.retweeted)
      &&(data.user.lang === 'en'))) {
    if (data.user.screen_name === this.screenName) {
      //console.log('Tweet kept directly: @'+data.user.screen_name+': '+data.text);
      return this.getShortLink(data);  
    }
    this.checkLanguage(data);
  }
}

// This method performs a naive language check on incoming tweets.
// It's not exact, and it errs on the side of not dropping English tweets.
Twitter.prototype.checkLanguage = function (data) {
  var results = detector.detect(data.text);
  //console.log('Top Language Result: %j', results[0]);
  if ((results[0][0] !== 'english') && (results[0][0] !== 'pidgin')) {
    if ((results[0][1] < 0.25)&&(data.text.length < 50)) {
      return this.checkDistance(data);
    }
  }
  this.checkDistance(data);
}

// Check the Levenshtein distance of this Tweet against each recent Tweet.
// If this Tweet isn't garbage, keep it.
Twitter.prototype.checkDistance = function (data) {
  var self = this;
  if (self.recentTweets.length > 0) {
    self.recentTweets.forEach( function (tweet, i) {
      var lev = new Levenshtein(data.text, tweet);
      if (lev.distance < self.twitFilter) {
        data.isGarbage = true;
        //console.log('Tweet declared garbage: @'+data.user.screen_name+': '+data.text);
      }
    });
  }
  if (!data.isGarbage) {
    self.logTweet(data);
    self.getShortLink(data);
  }
}

// This function provides a bit.ly shortlink to each tweet,
// provided bit.ly API credentials are available.
Twitter.prototype.getShortLink = function (data) {
  var self = this;
  if (!this.bitly) {
    return self.keepTweet(data);
  }
  var tweetURL = 'http://twitter.com/#!/'
                 + data.user.screen_name
                 + '/status/'
                 + data.id_str,
      self = this;
  return self.bitly.shorten(tweetURL, function (result) {
    // Check result.status_code here for bit.ly API errors
    if (result.data.url) {
      data.text += ' ( Tweet: ' + result.data.url + ' )';
    }
    self.keepTweet(data);
  });
}

// 'Keeping' a Tweet, in this case, means logging it and broadcasting it over hook.io.
Twitter.prototype.keepTweet = function (data) {
  var tweetMsg = '@' + data.user.screen_name + ' ' + data.text;
  tweetMsg = tweetMsg.replace(/\r/g, ' ')
                     .replace(/\n/g, ' ')
                     .replace(/&gt;/g, '>')
                     .replace(/&lt;/g, '<');
  this.emit('keptTweet', tweetMsg);
  //console.log(tweetMsg);
}

// Store the tweet, and perform any final actions.
Twitter.prototype.logTweet = function (data) {
  this.recentTweets.push(data.text);
  this.config.set('recentTweets', this.recentTweets);
  if (this.recentTweets.length > this.tweetsToSave) {
    this.recentTweets.shift();
  }
  if (!data.following && this.autoFollow) {
    this.follow(data.user.screen_name);
  }
}

// Other important Twitter API interaction methods.

Twitter.prototype.sendTweet = function (tweet, cb) {
  var self = this;

  if (typeof tweet === 'object') {
    tweet = tweet.msg;
  }

  tweet = tweet.substr(0, 139);
  self.twitConn.updateStatus(tweet, cb);
}

Twitter.prototype.follow = function (id) {
  var self = this;
  self.twitConn.createFriendship(id, function (err, result) {
    if (err) {return self.emit('error::follow', err.message);}
    console.log('I am now following ' + id);
    self.emit('following', id);
  });
}

Twitter.prototype.reportSpam = function (id, dest) {
  var self = this;
  self.twitConn.reportSpam(id, function (err, result) {
    if (err) {return self.emit('error::reportSpam', err.message);}
    console.log(result.screen_name, ' has been reported as a spammer.');
    self.emit('reported', {name: result.screen_name, to: dest});
  });
}

Twitter.prototype.block = function (id, dest) {
  var self = this;
  self.twitConn.createBlock(id, function (err, result) {
    if (err) {return self.emit('error::block', err.message);}
    console.log(result.screen_name, ' has been blocked.');
    self.emit('blocked', {name: result.screen_name, to: dest});
  });
}

// Hook.io Event Map

Twitter.prototype._initHook = function () {
  var self = this;

  self.on('**::twitter::tweet', function (data, cb) {
    console.log('sendTweet', this.event);
    self.sendTweet(data, cb);
  });

  self.on('**::twitter::follow', function (data) {
    self.follow(data);
  });

  self.on('**::twitter::report', function (data) {
    self.reportSpam(data.name, data.to);
  });

  self.on('**::twitter::block', function (data) {
    self.block(data.name, data.to);
  });

  self.on('**::twitter::stop', function (data) {
    self.stopStream();
  });

  self.on('**::twitter::start', function (data) {
    self.startStream();
  });

  /*
    
    TODO: Move config saving to core?
    
  self.on('**::twitter::save', function (data) {
    self.config.save(function (err) {
      if (err) {
        self.emit('saveError', err);
      }
      self.emit('saved', null);
    });
  });
  
  self.on('**::twitter::exit', function (data) {
    process.exit();
  });
  
  */

}

// Today's command-line interface was brought to you by node-prompt and recursion.

Twitter.prototype.startShell = require('./shell');



