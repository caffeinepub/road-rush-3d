import Runtime "mo:core/Runtime";

actor {
  var highScore = 0;

  public query ({ caller }) func getHighScore() : async Nat {
    highScore;
  };

  public shared ({ caller }) func submitScore(score : Nat) : async Bool {
    if (score > highScore) {
      highScore := score;
      true;
    } else {
      false;
    };
  };

  public shared ({ caller }) func resetHighScore() : async () {
    highScore := 0;
  };
};
