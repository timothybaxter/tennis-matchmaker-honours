using System;
using System.Collections.Generic;
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

            [JsonPropertyName("createdAt")]
            public DateTime CreatedAt { get; set; }
        }
    }
