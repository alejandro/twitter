//
// Simple command line shell client for Twitter hook
//
var prompt = require('prompt');

var shell = module['exports'] = function () {
  console.log(this.screenName);
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
        self.startShell()
        break;
      case 'follow':
        self.follow(command[1]);
        self.startShell()
        break;
      case 'report':
        self.reportSpam(command[1]);
        self.startShell()
        break;
      case 'block':
        self.block(command[1]);
        self.startShell()
        break;
      case 'save':
        self.save();
        console.log('Configuration data has been saved.'.blue);
        self.startShell()
        break;
      case 'dump':
        console.dir(self.recentTweets);
        console.log('Dump of recent tweets completed.'.magenta);
        self.startShell()
        break;
      case 'stop':
        self.stopStream();
        self.startShell()
        break;
      case 'restart':
        console.log('Restarting connection to Twitter Streaming API...'.grey);
        self.startStream();
        break;      
      case 'exit':
        process.exit();
        break;
      default:
        console.log('Sorry, that does not make sense to me.'.yellow);
        self.startShell()
    }
  });
}