using System.Text.Json.Serialization;
using System.Collections.Generic;

namespace TennisMatchmakingSite2.Models
{
    public class MatchRequestModel
    {
        [JsonPropertyName("id")]
        public string Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; }

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; }

        [JsonPropertyName("email")]
        public string Email { get; set; }
    }

    public class MatchRequestsResponse
    {
        [JsonPropertyName("requests")]
        public List<MatchRequestModel> Requests { get; set; } = new List<MatchRequestModel>();

        [JsonPropertyName("matchId")]
        public string MatchId { get; set; }
    }

    public class MatchRequestResponse
    {
        [JsonPropertyName("matchId")]
        public string MatchId { get; set; }

        [JsonPropertyName("requesterId")]
        public string RequesterId { get; set; }

        [JsonPropertyName("accept")]
        public bool Accept { get; set; }
    }
}