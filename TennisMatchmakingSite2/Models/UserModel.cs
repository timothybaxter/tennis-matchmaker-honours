using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class UserModel
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("email")]
        public string Email { get; set; } = string.Empty;

        [JsonPropertyName("playerLevel")]
        public string PlayerLevel { get; set; } = string.Empty;
    }

    public class FriendsResponse
    {
        [JsonPropertyName("friends")]
        public List<UserModel> Friends { get; set; } = new List<UserModel>();
    }

    public class SearchUsersResponse
    {
        [JsonPropertyName("users")]
        public List<UserModel> Users { get; set; } = new List<UserModel>();
    }
}