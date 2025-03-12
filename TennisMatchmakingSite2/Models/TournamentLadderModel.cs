using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    #region Match Data Models
    public class CompMatchData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("tournamentId")]
        public string TournamentId { get; set; }

        [JsonPropertyName("ladderId")]
        public string LadderId { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("player1")]
        public string Player1 { get; set; }

        [JsonPropertyName("player2")]
        public string Player2 { get; set; }

        [JsonPropertyName("challengerId")]
        public string ChallengerId { get; set; }

        [JsonPropertyName("challengeeId")]
        public string ChallengeeId { get; set; }

        [JsonPropertyName("winner")]
        public string Winner { get; set; }

        [JsonPropertyName("deadline")]
        public DateTime? Deadline { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("completedAt")]
        public DateTime? CompletedAt { get; set; }

        [JsonPropertyName("scores")]
        public List<ScoreSet> Scores { get; set; }

        [JsonPropertyName("isChallengee")]
        public bool IsChallengee { get; set; }

        [JsonPropertyName("isWinner")]
        public bool IsWinner { get; set; }

        [JsonPropertyName("opponent")]
        public OpponentData Opponent { get; set; }

        [JsonPropertyName("tournament")]
        public TournamentInfo Tournament { get; set; }

        [JsonPropertyName("ladder")]
        public LadderInfo Ladder { get; set; }

        [JsonPropertyName("timeRemaining")]
        public long? TimeRemaining { get; set; }

        [JsonPropertyName("isExpired")]
        public bool? IsExpired { get; set; }

        [JsonPropertyName("player1Details")]
        public UserDetails Player1Details { get; set; }

        [JsonPropertyName("player2Details")]
        public UserDetails Player2Details { get; set; }

        [JsonPropertyName("challenger")]
        public UserDetails Challenger { get; set; }

        [JsonPropertyName("challengee")]
        public UserDetails Challengee { get; set; }

        [JsonPropertyName("player1Submitted")]
        public bool Player1Submitted { get; set; }

        [JsonPropertyName("player2Submitted")]
        public bool Player2Submitted { get; set; }

        [JsonPropertyName("challengerSubmitted")]
        public bool ChallengerSubmitted { get; set; }

        [JsonPropertyName("challengeeSubmitted")]
        public bool ChallengeeSubmitted { get; set; }
    }

    public class ScoreSet
    {
        [JsonPropertyName("player1")]
        public int Player1 { get; set; }

        [JsonPropertyName("player2")]
        public int Player2 { get; set; }
    }

    public class OpponentData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }
    }

    public class TournamentInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; }
    }

    public class LadderInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }
    }
    #endregion

    #region Stats Models
    public class MatchStatsData
    {
        [JsonPropertyName("totalMatches")]
        public int TotalMatches { get; set; }

        [JsonPropertyName("wins")]
        public int Wins { get; set; }

        [JsonPropertyName("losses")]
        public int Losses { get; set; }

        [JsonPropertyName("winRate")]
        public int WinRate { get; set; }

        [JsonPropertyName("tournamentsParticipated")]
        public int TournamentsParticipated { get; set; }

        [JsonPropertyName("tournamentMatches")]
        public int TournamentMatches { get; set; }

        [JsonPropertyName("tournamentWins")]
        public int TournamentWins { get; set; }

        [JsonPropertyName("tournamentWinRate")]
        public int TournamentWinRate { get; set; }

        [JsonPropertyName("laddersParticipated")]
        public int LaddersParticipated { get; set; }

        [JsonPropertyName("ladderMatches")]
        public int LadderMatches { get; set; }

        [JsonPropertyName("ladderWins")]
        public int LadderWins { get; set; }

        [JsonPropertyName("ladderRankImprovements")]
        public int LadderRankImprovements { get; set; }

        [JsonPropertyName("recentPerformance")]
        public List<RecentMatch> RecentPerformance { get; set; }
    }

    public class RecentMatch
    {
        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("date")]
        public DateTime Date { get; set; }

        [JsonPropertyName("isWin")]
        public bool IsWin { get; set; }
    }
    #endregion

    #region View Models
    public class CompetitionViewModel
    {
        public bool IsPersonal { get; set; }
        public List<TournamentData> Tournaments { get; set; } = new List<TournamentData>();
        public List<LadderData> Ladders { get; set; } = new List<LadderData>();
    }

    public class CreateTournamentViewModel
    {
        [Required(ErrorMessage = "Tournament name is required")]
        [StringLength(50, MinimumLength = 3, ErrorMessage = "Name must be between 3 and 50 characters")]
        public string Name { get; set; }

        [Required(ErrorMessage = "Format is required")]
        [Display(Name = "Tournament Format")]
        public string Format { get; set; } = "single"; // single or double

        [Required(ErrorMessage = "Visibility is required")]
        public string Visibility { get; set; } = "public"; // public or private

        [Required(ErrorMessage = "Challenge window is required")]
        [Range(1, 168, ErrorMessage = "Challenge window must be between 1 and 168 hours")]
        [Display(Name = "Challenge Window (hours)")]
        public int ChallengeWindow { get; set; } = 48; // Default to 48 hours

        [Display(Name = "Recommended Skill Level")]
        public string SkillLevel { get; set; } = "All Levels";
    }

    public class CreateLadderViewModel
    {
        [Required(ErrorMessage = "Ladder name is required")]
        [StringLength(50, MinimumLength = 3, ErrorMessage = "Name must be between 3 and 50 characters")]
        public string Name { get; set; }

        [Required(ErrorMessage = "Visibility is required")]
        public string Visibility { get; set; } = "public"; // public or private

        [Required(ErrorMessage = "Challenge window is required")]
        [Range(1, 168, ErrorMessage = "Challenge window must be between 1 and 168 hours")]
        [Display(Name = "Challenge Window (hours)")]
        public int ChallengeWindow { get; set; } = 48; // Default to 48 hours

        [Display(Name = "Recommended Skill Level")]
        public string SkillLevel { get; set; } = "All Levels";
    }

    public class SubmitMatchResultViewModel
    {
        [Required]
        public string MatchId { get; set; }

        [Required]
        public string Winner { get; set; } // User ID of winner

        [Required]
        public List<ScoreSet> Scores { get; set; } = new List<ScoreSet>();
    }
    #endregion

    #region Common Data Models
    public class UserDetails
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }
    }
    #endregion

    #region Tournament Models
    public class TournamentData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("skillLevel")]
        public string SkillLevel { get; set; }

        [JsonPropertyName("challengeWindow")]
        public int ChallengeWindow { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("startedAt")]
        public DateTime? StartedAt { get; set; }

        [JsonPropertyName("completedAt")]
        public DateTime? CompletedAt { get; set; }

        [JsonPropertyName("creatorDetails")]
        public UserDetails CreatorDetails { get; set; }

        // Changed from List<TournamentPlayer> to List<string> to match view expectations
        [JsonPropertyName("players")]
        public List<string> Players { get; set; } = new List<string>();

        [JsonPropertyName("tournamentPlayers")]
        public List<TournamentPlayer> TournamentPlayers { get; set; } = new List<TournamentPlayer>();
    }

    public class TournamentPlayer
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("seed")]
        public int? Seed { get; set; }

        [JsonPropertyName("playerDetails")]
        public UserDetails PlayerDetails { get; set; }
    }

    public class TournamentDetailData : TournamentData
    {
        [JsonPropertyName("matches")]
        public List<TournamentMatch> Matches { get; set; } = new List<TournamentMatch>();

        [JsonPropertyName("rounds")]
        public List<TournamentRound> Rounds { get; set; } = new List<TournamentRound>();

        [JsonPropertyName("winner")]
        public string Winner { get; set; }

        [JsonPropertyName("winnerDetails")]
        public UserDetails WinnerDetails { get; set; }

        // Properties required by the view
        [JsonPropertyName("creatorId")]
        public string CreatorId { get; set; }

        [JsonPropertyName("visibility")]
        public string Visibility { get; set; } = "public";

        [JsonPropertyName("playerDetails")]
        public List<UserDetails> PlayerDetails { get; set; } = new List<UserDetails>();

        [JsonPropertyName("bracket")]
        public BracketData Bracket { get; set; }

        // Helper properties for the view
        public bool IsCreator { get; set; }
        public bool IsParticipant { get; set; }
        public bool CanStart => IsCreator && Status == "pending" && Players.Count >= 2;
    }

    public class TournamentRound
    {
        [JsonPropertyName("roundNumber")]
        public int RoundNumber { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("matches")]
        public List<TournamentMatch> Matches { get; set; } = new List<TournamentMatch>();
    }

    public class TournamentMatch
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("matchNumber")]
        public int MatchNumber { get; set; }

        [JsonPropertyName("roundNumber")]
        public int RoundNumber { get; set; }

        [JsonPropertyName("player1")]
        public string Player1 { get; set; }

        [JsonPropertyName("player2")]
        public string Player2 { get; set; }

        [JsonPropertyName("player1Details")]
        public UserDetails Player1Details { get; set; }

        [JsonPropertyName("player2Details")]
        public UserDetails Player2Details { get; set; }

        [JsonPropertyName("winner")]
        public string Winner { get; set; }  // "player1", "player2", or null

        [JsonPropertyName("winnerDetails")]
        public UserDetails WinnerDetails { get; set; }

        [JsonPropertyName("nextMatchNumber")]
        public int? NextMatchNumber { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }  // "pending", "scheduled", "completed"

        [JsonPropertyName("scores")]
        public List<ScoreSet> Scores { get; set; }

        [JsonPropertyName("deadline")]
        public DateTime? Deadline { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("scheduledAt")]
        public DateTime? ScheduledAt { get; set; }

        [JsonPropertyName("completedAt")]
        public DateTime? CompletedAt { get; set; }

        // Properties required by the view
        [JsonPropertyName("round")]
        public int? Round { get; set; }

        [JsonPropertyName("isParticipant")]
        public bool IsParticipant { get; set; }

        [JsonPropertyName("canSubmitResult")]
        public bool CanSubmitResult { get; set; }
    }
    #endregion

    #region Bracket Models
    public class BracketData
    {
        [JsonPropertyName("numPlayers")]
        public int NumPlayers { get; set; }

        [JsonPropertyName("numRounds")]
        public int NumRounds { get; set; }

        [JsonPropertyName("format")]
        public string Format { get; set; }

        [JsonPropertyName("rounds")]
        public List<RoundData> Rounds { get; set; } = new List<RoundData>();
    }

    public class RoundData
    {
        [JsonPropertyName("roundNumber")]
        public int RoundNumber { get; set; }

        [JsonPropertyName("matches")]
        public List<BracketMatchData> Matches { get; set; } = new List<BracketMatchData>();
    }

    public class BracketMatchData
    {
        [JsonPropertyName("matchNumber")]
        public int MatchNumber { get; set; }

        [JsonPropertyName("player1")]
        public BracketPlayerData Player1 { get; set; }

        [JsonPropertyName("player2")]
        public BracketPlayerData Player2 { get; set; }

        [JsonPropertyName("winner")]
        public BracketPlayerData Winner { get; set; }

        [JsonPropertyName("fromMatch1")]
        public int? FromMatch1 { get; set; }

        [JsonPropertyName("fromMatch2")]
        public int? FromMatch2 { get; set; }
    }

    public class BracketPlayerData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        // These will be filled in from the user details
        public string Name { get; set; }
        public string PlayerLevel { get; set; }
    }

    public class ScoreData
    {
        [JsonPropertyName("player1")]
        public int Player1 { get; set; }

        [JsonPropertyName("player2")]
        public int Player2 { get; set; }
    }

    public class RecentMatchData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("date")]
        public DateTime Date { get; set; }

        [JsonPropertyName("isWin")]
        public bool IsWin { get; set; }

        [JsonPropertyName("type")]
        public string Type { get; set; }

        [JsonPropertyName("contextId")]
        public string ContextId { get; set; }
    }
    #endregion

    #region Ladder Models
    public class LadderData
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("skillLevel")]
        public string SkillLevel { get; set; }

        [JsonPropertyName("challengeWindow")]
        public int ChallengeWindow { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("creatorDetails")]
        public UserDetails CreatorDetails { get; set; }

        [JsonPropertyName("positions")]
        public List<LadderPosition> Positions { get; set; } = new List<LadderPosition>();
    }

    public class LadderPosition
    {
        [JsonPropertyName("rank")]
        public int Rank { get; set; }

        [JsonPropertyName("playerId")]
        public string PlayerId { get; set; }

        [JsonPropertyName("playerDetails")]
        public UserDetails PlayerDetails { get; set; }
    }

    public class LadderDetailData : LadderData
    {
        [JsonPropertyName("matches")]
        public List<LadderMatch> Matches { get; set; } = new List<LadderMatch>();

        [JsonPropertyName("myRank")]
        public int? MyRank { get; set; }

        [JsonPropertyName("canChallenge")]
        public List<UserDetails> CanChallenge { get; set; } = new List<UserDetails>();

        // Properties required by the view
        [JsonPropertyName("creatorId")]
        public string CreatorId { get; set; }

        [JsonPropertyName("visibility")]
        public string Visibility { get; set; } = "public";

        [JsonPropertyName("challengeablePositions")]
        public List<LadderPosition> ChallengeablePositions { get; set; } = new List<LadderPosition>();

        [JsonPropertyName("userHasActiveChallenge")]
        public bool UserHasActiveChallenge { get; set; }

        // Helper properties for the view
        public bool IsCreator { get; set; }
        public bool IsParticipant { get; set; }
        public int? CurrentUserRank { get; set; }
    }

    public class LadderMatch
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("challenger")]
        public UserDetails Challenger { get; set; }

        [JsonPropertyName("challengee")]
        public UserDetails Challengee { get; set; }

        [JsonPropertyName("winner")]
        public UserDetails Winner { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }  // "challenge", "scheduled", "completed", "declined"

        [JsonPropertyName("scores")]
        public List<ScoreSet> Scores { get; set; }

        [JsonPropertyName("deadline")]
        public DateTime? Deadline { get; set; }

        [JsonPropertyName("challengedAt")]
        public DateTime ChallengedAt { get; set; }

        [JsonPropertyName("scheduledAt")]
        public DateTime? ScheduledAt { get; set; }

        [JsonPropertyName("completedAt")]
        public DateTime? CompletedAt { get; set; }

        [JsonPropertyName("rankBefore")]
        public int? RankBefore { get; set; }

        [JsonPropertyName("rankAfter")]
        public int? RankAfter { get; set; }

        // Properties required by the view
        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("challengerId")]
        public string ChallengerId { get; set; }

        [JsonPropertyName("challengeeId")]
        public string ChallengeeId { get; set; }

        [JsonPropertyName("challengerRank")]
        public int? ChallengerRank { get; set; }

        [JsonPropertyName("challengeeRank")]
        public int? ChallengeeRank { get; set; }

        [JsonPropertyName("canSubmitResult")]
        public bool CanSubmitResult { get; set; }
    }


    #endregion
}