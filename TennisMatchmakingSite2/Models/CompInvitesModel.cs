using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    // Model for tournament invitations
    public class TournamentInvitationModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("tournamentId")]
        public string TournamentId { get; set; }

        [JsonPropertyName("tournamentName")]
        public string TournamentName { get; set; }

        [JsonPropertyName("inviterId")]
        public string InviterId { get; set; }

        [JsonPropertyName("inviterName")]
        public string InviterName { get; set; }

        [JsonPropertyName("inviteeId")]
        public string InviteeId { get; set; }

        [JsonPropertyName("inviteeName")]
        public string InviteeName { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        // Helper properties for the view
        public bool IsPending => Status == "pending";
        public bool IsAccepted => Status == "accepted";
        public bool IsRejected => Status == "rejected";
        public bool IsExpired => Status == "expired";
        public bool IsCancelled => Status == "cancelled";
    }

    // Model for ladder invitations
    public class LadderInvitationModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("ladderId")]
        public string LadderId { get; set; }

        [JsonPropertyName("ladderName")]
        public string LadderName { get; set; }

        [JsonPropertyName("inviterId")]
        public string InviterId { get; set; }

        [JsonPropertyName("inviterName")]
        public string InviterName { get; set; }

        [JsonPropertyName("inviteeId")]
        public string InviteeId { get; set; }

        [JsonPropertyName("inviteeName")]
        public string InviteeName { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("updatedAt")]
        public DateTime? UpdatedAt { get; set; }

        // Helper properties for the view
        public bool IsPending => Status == "pending";
        public bool IsAccepted => Status == "accepted";
        public bool IsRejected => Status == "rejected";
        public bool IsExpired => Status == "expired";
        public bool IsCancelled => Status == "cancelled";
    }

    // View model for unified competition invitations page (both tournaments and ladders)
    public class CompetitionInvitationsViewModel
    {
        public List<TournamentInvitationModel> TournamentInvitations { get; set; } = new List<TournamentInvitationModel>();
        public List<LadderInvitationModel> LadderInvitations { get; set; } = new List<LadderInvitationModel>();
    }

    // View model for tournament invitations management page
    public class TournamentInvitationsViewModel
    {
        public TournamentDetailData Tournament { get; set; }
        public List<TournamentInvitationModel> Invitations { get; set; } = new List<TournamentInvitationModel>();
        public UserSearchViewModel SearchModel { get; set; } = new UserSearchViewModel();
    }

    // View model for ladder invitations management page
    public class LadderInvitationsViewModel
    {
        public LadderDetailData Ladder { get; set; }
        public List<LadderInvitationModel> Invitations { get; set; } = new List<LadderInvitationModel>();
        public UserSearchViewModel SearchModel { get; set; } = new UserSearchViewModel();
    }

    // User search models
    public class UserSearchResult
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("email")]
        public string Email { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }

        // Helper properties for the view
        public bool IsAlreadyInTournament { get; set; }
        public bool IsAlreadyInLadder { get; set; }
        public bool IsAlreadyInvited { get; set; }
    }

    public class UserSearchViewModel
    {
        public string SearchTerm { get; set; }
        public List<UserSearchResult> Results { get; set; } = new List<UserSearchResult>();
    }
}