var Hook = require('hook.io').Hook,
    TwitObj = require('ntwitter'),
    Levenshtein = require('levenshtein'),
    colors = require('colors'),
    prompt = require('prompt'),
    util = require('util');    

var Twitter = exports.Twitter = function(options) {
  for (var o in options) {
    this[o] = options[o];
  }
  Hook.call(this);
  var self = this;
  self.on('ready', function () {
    self.twitConn = new TwitObj(self.get('auth'));
    self.recentTweets = self.get('recentTweets');
    self.verify(function (err) {
      if (err) { return console.log(err.stack); }
      var options = {
        track: self.get('track'),
        follow: self.twitterID
      };
      self.startStream(self.twitMethod, options);
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
  this.shell();
}

Twitter.prototype.verify = function (cb) {
  var self = this;
  self.twitConn.verifyCredentials(function (err, data) {
    if (err) { return cb(err); }
    self.twitterID = data.id;
    self.screenName = data.screen_name;
    console.log('Twitter Credentials Accepted!'.green);
    cb(null);
  });
}

Twitter.prototype.startStream = function (method, options) {
  var self = this;
  console.log('info: attempting connection to Twitter stream API...'.grey)
  self.twitConn.stream(method, {track: options.track, follow: options.follow}, function(stream) {
    self.streamSuccess();
    stream.on('data', function (data) {
      self.checkTweet(data);
    });
    stream.on('error', function (error) {
      console.log(error.stack);
    });
  });
}

Twitter.prototype.streamSuccess = function () {
  console.log('info: connection successful.  Awaiting tweets...'.green);
  if (this.useShell) { this._initShell(); }
  this._initHook();
}

// The Tweet Chain: a chain of methods to analyze incoming tweets.

// First check the basic validity of the tweet; if it's valid and an @reply to
// the current user, keep it directly.  If not an @reply, go to the next step in the chain.
Twitter.prototype.checkTweet = function (data) {
  if ((data.text)
      &&((!(/.*\bRT:?.*/i).test(data.text))
      &&(!data.retweeted)
      &&(data.user.lang === 'en'))) {
    if (data.in_reply_to_user_id_str === this.twitterID) {
      util.debug('Tweet kept directly: @'+data.user.screen_name+': '+data.text);
      return this.keepTweet(data);  
    }
    this.checkDistance(data);
  }
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
        util.debug('Tweet declared garbage: @'+data.user.screen_name+': '+data.text);
      }
    });
    if (!data.isGarbage) { self.keepTweet(data) }
  }
}

// 'Keeping' a Tweet, in this case, means logging it and broadcasting it over hook.io.
Twitter.prototype.keepTweet = function (data) {
  var tweetMsg = '@' + data.user.screen_name + ' ' + data.text;
  tweetMsg = tweetMsg.replace(/\r/g, ' ')
                     .replace(/\n/g, ' ')
                     .replace(/&gt;/g, '>')
                     .replace(/&lt;/g, '<');
  this.emit('o.keptTweet', tweetMsg);
  console.log(tweetMsg);
  this.logTweet(data);
}

// Store the tweet, and perform any final actions.
Twitter.prototype.logTweet = function (data) {
  this.recentTweets.push(data.text);
  if (this.recentTweets.length > this.tweetsToKeep) {
    this.recentTweets.shift();
  }
  if ((!data.following)&&(this.autoFollow)) {
    this.follow(data.user.screen_name);
  }
}

// Other important Twitter API interaction methods.

Twitter.prototype.sendTweet = function (tweet) {
  var self = this;
  this.twitConn.updateStatus(tweet, function (err, data) {
    if (err) {return console.log(err.stack);}
    console.log('Tweeted: ' + tweet);
    self.emit('o.tweeted', tweet);
  });
}

Twitter.prototype.follow = function (id) {
  var self = this;
  self.twitConn.createFriendship(id, function (err, result) {
    if (err) {return console.log(err.stack);}
    console.log('I am now following ' + id);
    self.emit('o.following', id);
  });
}

Twitter.prototype.reportSpam = function (id) {
  var self = this;
  self.twitConn.reportSpam(id, function (err, result) {
    if (err) {return console.log(err.stack);}
    console.log(result.screen_name, ' has been reported as a spammer.');
    self.emit('o.reported', result.screen_name);
    self.block(id);
  });
}

Twitter.prototype.block = function (id) {
  var self = this;
  self.twitConn.createBlock(id, function (err, result) {
    if (err) {return console.log(err.stack);}
    console.log(result.screen_name, ' has been blocked.');
    self.emit('o.blocked', result.screen_name);
  });
}

// Hook.io API

Twitter.prototype._initHook = function () {
  var self = this;

  self.on('i.tweet.o.tweet', function (fullEvent, event, data) {
    self.sendTweet(data);
  });

  self.on('i.follow.o.follow', function (fullEvent, event, data) {
    self.follow(id);
  });

  self.on('i.report.o.report', function (fullEvent, event, data) {
    self.report(data);
  });

  self.on('i.block.o.block', function (fullEvent, event, data) {
    self.block(data);
  });

  self.on('i.save.o.save', function (fullEvent, event, data) {
    self.save();
    self.emit('o.savedConfig');
  });

  self.on('i.exit.o.exit', function (fullEvent, event, data) {
    process.exit();
  });
}

// Today's command-line interface was brought to you by node-prompt and recursion.

Twitter.prototype.shell = function () {
  var self = this,
      properties = {
        name: 'command',
        message: self.screenName.magenta.bold
      };
  prompt.resume();
  prompt.get(properties, function (err, results) {
    prompt.pause();
    if (err) {return console.log(err.stack)}
    var command = results.command.split(' ');
    switch (command[0]) {
      case 'tweet':
        self.sendTweet(command.slice(1).join(' '));
        self.shell();
        break;
      case 'follow':
        self.follow(command[1]);
        self.shell();
        break;
      case 'report':
        self.reportSpam(command[1]);
        self.shell();
        break;
      case 'block':
        self.block(command[1]);
        self.shell();
        break;
      case 'save':
        self.save();
        console.log('Configuration data has been saved.'.blue);
        self.shell();
        break;
      case 'dump':
        console.dir(self.recentTweets);
        console.log('Dump of recent tweets completed.'.magenta);
        self.shell();
        break;
      case 'exit':
        process.exit();
        break;
      default:
        console.log('Sorry, that does not make sense to me.'.yellow);
        self.shell();
    }
  });
}



