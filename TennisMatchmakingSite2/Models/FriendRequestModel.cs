using System.Collections.Generic;
using System;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class FriendRequestModel
    {
        [JsonPropertyName("friendshipId")]
        public string FriendshipId { get; set; } = string.Empty;

        [JsonPropertyName("requester")]
        public UserModel Requester { get; set; } = new UserModel();

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    public class FriendRequestsResponse
    {
        [JsonPropertyName("friendRequests")]
        public List<FriendRequestModel> FriendRequests { get; set; } = new List<FriendRequestModel>();
    }
}