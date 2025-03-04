using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class ConversationModel
    {
        [JsonPropertyName("conversationId")]
        public string ConversationId { get; set; }

        [JsonPropertyName("otherUser")]
        public UserModel OtherUser { get; set; }

        [JsonPropertyName("lastMessageAt")]
        public DateTime LastMessageAt { get; set; }

        [JsonPropertyName("unreadCount")]
        public int UnreadCount { get; set; }
    }

    public class ConversationsResponse
    {
        [JsonPropertyName("conversations")]
        public List<ConversationModel> Conversations { get; set; } = new List<ConversationModel>();
    }

    public class ConversationDetail
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; }

        [JsonPropertyName("participants")]
        public List<string> Participants { get; set; } = new List<string>();

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }

        [JsonPropertyName("updatedAt")]
        public DateTime UpdatedAt { get; set; }
    }
}