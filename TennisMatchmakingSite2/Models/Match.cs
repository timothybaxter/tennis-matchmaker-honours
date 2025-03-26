using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class MatchResponseWrapper
    {
        public List<MatchData> Matches { get; set; } = new List<MatchData>();
    }

    public class MatchData
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; }

        [JsonPropertyName("courtLocation")]
        public string CourtLocation { get; set; }

        [JsonPropertyName("posterName")]
        public string PosterName { get; set; }

        [JsonPropertyName("matchTime")]
        public DateTime MatchTime { get; set; }

        [JsonPropertyName("matchType")]
        public string MatchType { get; set; }

        [JsonPropertyName("status")]
        public string Status { get; set; }

        [JsonPropertyName("skillLevel")]
        public string SkillLevel { get; set; }

        [JsonPropertyName("creatorId")]
        public string CreatorId { get; set; }

        [JsonPropertyName("participants")]
        public List<string> Participants { get; set; } = new List<string>();

        [JsonPropertyName("requestedBy")]
        public List<string> RequestedBy { get; set; } = new List<string>();

        [JsonPropertyName("rejectedRequests")]
        public List<string> RejectedRequests { get; set; } = new List<string>();

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("requestStatus")]
        public string RequestStatus { get; set; }

        public bool IsFull
        {
            get
            {
                if (MatchType?.ToLower() == "singles")
                    return Participants != null && Participants.Count >= 2;
                else if (MatchType?.ToLower() == "doubles" || MatchType?.ToLower() == "mixed")
                    return Participants != null && Participants.Count >= 4;
                return false;
            }
        }

        // Inside your MatchData model class:

        // Add this method to ensure participant details are available
        public void EnsureParticipantDetails()
        {
            if (ParticipantDetails == null)
            {
                ParticipantDetails = new List<ParticipantInfo>();
            }

            if (Participants != null)
            {
                // Make sure each participant has an entry in ParticipantDetails
                foreach (var participantId in Participants)
                {
                    if (!ParticipantDetails.Any(p => p.Id == participantId))
                    {
                        // Create a default entry
                        var name = "Player";

                        // If this is the creator, use the poster name
                        if (participantId == CreatorId && !string.IsNullOrEmpty(PosterName))
                        {
                            name = PosterName;
                        }

                        ParticipantDetails.Add(new ParticipantInfo
                        {
                            Id = participantId,
                            Name = name,
                            PlayerLevel = "Unknown"
                        });
                    }
                }
            }
        }

        // Property to get participant names if they've been loaded
        [JsonPropertyName("participantDetails")]
        public List<ParticipantInfo> ParticipantDetails { get; set; } = new List<ParticipantInfo>();
    }

    // Helper class for participant details
    public class ParticipantInfo
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }
    }

    public class MatchDetailResponse
    {
        [JsonPropertyName("match")]
        public MatchData Match { get; set; }
    }

        public class UserLookupResult
        {
            [JsonPropertyName("id")]
            public string Id { get; set; }

            [JsonPropertyName("name")]
            public string Name { get; set; }

            [JsonPropertyName("playerLevel")]
            public string PlayerLevel { get; set; }

            [JsonPropertyName("email")]
            public string Email { get; set; }

            // UI-specific properties (not from API)
            public bool IsAlreadyInTournament { get; set; }
            public bool IsAlreadyInLadder { get; set; }
            public bool IsAlreadyInvited { get; set; }
        }
    }
