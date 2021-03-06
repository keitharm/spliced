var gameLogic = require('../game/gameLogic.js');
var getRandomPrompt = require('../game/prompts.js');
var Player = require('../models/Player.js');
var _ = require('lodash');
var Levenshtein = require('fast-levenshtein');

var Game = function (gameCode, options) {
  this.code = gameCode;
  this.prompt = "";
  this.name = options.name || "AWESOME SPLICED GAME";
  this.numTiles = options.numTiles || 4;
  this.timeLimit = options.timeLimit || null;
  // this.maxPlayers = options.maxPlayers || null;
  this.nextAvailablePlayerId = 0;
  this.playersBySocket = {};
  this.players = [];
  this.currentRound = {
    roundId: 0,
    correctGuesses: 0
  };
};

Game.prototype.constructor = Game;

Game.prototype.addPlayer = function (playerOptions) {
  // give player a simple id within game (for game logic)
  playerOptions.playerId = this.nextAvailablePlayerId;
  this.nextAvailablePlayerId++;

  // use their socketId as identifying key in player hash (for easy lookup)
  var player = new Player(playerOptions);
  this.playersBySocket[player.socketId] = player;
  this.players[player.playerId] = player;
};

Game.prototype.startGame = function () {
  
  // get new game prompt, increment round, reset correct guess counter
  this.prompt = getRandomPrompt();
  this.currentRound.roundId++;
  this.currentRound.correctGuesses = 0;

  // reset player roles and panelIds
  for (var i=0; i<this.nextAvailablePlayerId; i++) {  //reset everyone to guesser
    this.players[i].role = "guesser";
    this.players[i].panelId = null; 
  }
  
  // randomly assign (numTiles) # of drawers
  var drawerCount = 0;
  var newVictimId;
  while (drawerCount < this.numTiles) {
    newVictimId = Math.floor(Math.random()*this.nextAvailablePlayerId);
    if (this.players[newVictimId].role !== "drawer") {
      this.players[newVictimId].role = "drawer";
      this.players[newVictimId].panelId = drawerCount;
      drawerCount++;
    }
  }
  return this;
};

Game.prototype.submitGuess = function (socketId, guess) {
  var guesser = this.playersBySocket[socketId];

  // if (guess === this.prompt) {  //pre-keith/levenshtein version just compared string equality
  var levScore = levCompare(guess, this.prompt);  // uses modified fast-levenshtein algorithm to accept near-correct answers
  var tolerance = 4;                           // how close is close enough for us?

  var result = {
    player: guesser,
    guess: guess,
    levScore: levScore,
    bingo: false,
    gameOver: false
  };

  if (levScore <= tolerance) {
    result.bingo = true;
    // guesser gets points based on how many correct guesses have already been entered
    var pointsAwarded = this.numTiles - this.currentRound.correctGuesses;
    guesser.score += pointsAwarded;
    // drawers also get points per correct guess
    this.players.forEach(function (player) {
      if (player.role === "drawer") {
        player.score++;
      }
    });
    this.currentRound.correctGuesses++;
    if (this.currentRound.correctGuesses === this.numTiles) {
      result.gameOver = true;
    }
  }
  return result;
};


function levCompare(given, answer) {
  if (!Array.isArray(answer)) {
    answer = [answer];
  }

  var scores = [];
  _.each(answer, function(word) {
    scores.push(run(given, word));
  });
  console.log(scores);
  return Math.min.apply(null, scores);

  function run(given, answer) {
    // Unimportant words to ignore
    var unimportant = ["a", "an", "the", "of"];

    // Don't penalize capital letters
    given  = given.toLowerCase();
    answer = answer.toLowerCase();

    // Split into words array
    var given_split = given.split(" ");
    var answer_split = answer.split(" ");

    // Remove the unimportant words
    given_split = given_split.filter(function(word) {
      var small = false;
      _.each(unimportant, function(u_word) {
        if (Levenshtein.get(word, u_word) === 1) {
          small = true;
        }
      });

      if (small) {
        return false;
      }
      return unimportant.indexOf(word) === -1;
    });

    answer_split = answer_split.filter(function(word) {
      var small = false;
      _.each(unimportant, function(u_word) {
        if (Levenshtein.get(word, u_word) === 1) {
          small = true;
        }
      });

      if (small) {
        return false;
      }
      return unimportant.indexOf(word) === -1;
    });

    // Keep track of score
    var score = 0;
    _.each(given_split, function(word) {

      var results = [];
      _.each(answer_split, function(aword) {
        results.push(Levenshtein.get(word, aword));
      });

      score += Math.min.apply(null, results);
    });

    var lev_score = Levenshtein.get(given_split.join(" "), answer_split.join(" "));
    return lev_score + score;
  }
}


module.exports = Game;