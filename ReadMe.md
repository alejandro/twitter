# Hook.io Twitter - Twitter connectivity for your Hook.io applications

Hook.io Twitter is a wrapper around the most commonly used parts of [ntwitter](http://github.com/AvianFlu/ntwitter) that provides support for the Twitter streaming API, and for several methods in the Twitter REST API.

## To Install

      git clone git@github.com:hookio/twitter.git
      cd twitter
      npm install

## Hook.io Event Names

### Events listened for:

**tweet** *message* - Tweets [message] from the configured Twitter account.

**follow** *username* - Starts following the given user.

**report** *username* - Reports the given user for spam and blocks them.

**block** *username* - Blocks the given user.  Note: will not block all tweets from that user.

**stopTweets** - Disconnects the connection to the Twitter streaming API, if connected.

**startTweets** - Reconnects to the Twitter streaming API, if not already connected.

**save** - Saves configuration to disk.

### Events Emitted:

**twitVerified** - Your Twitter API credentials have been approved.

**connecting** - Starting connection to Twitter Stream API.

**streamConnected** - Streaming API connection started.

**keptTweet** *message* - An incoming tweet has cleared all filters, and is being shared.

**tweeted** *message* - The given message has been successfully tweeted.

**following** *username* - The given user is now being followed.

**reported** *username* - The given user has been reported as a spammer.

**blocked** *username* - The given user has been blocked.


## Twitter Stream Filtering

The public Twitter feed is a lot of data, even with a seemingly narrow list of search terms, and, as a result, Hook.io Twitter has several filtering mechanisms in place.

- No retweets.  Any tweet flagged as a retweet or containing any form of "RT:" will be dropped.
- The tweets are subjected to a basic level of language detection with the help of [this library](https://github.com/FGRibreau/node-language-detect)
- A history of past tweets is kept, and any tweet with too small a [Levenshtein Distance](http://github.com/gf3/Levenshtein) compared to any past tweet is discarded.

Twitter stream filtering is an imperfect and ongoing process - suggestions are always welcome.

