using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class MessageModel
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; }

        [JsonPropertyName("conversationId")]
        public string ConversationId { get; set; }

        [JsonPropertyName("senderId")]
        public string SenderId { get; set; }

        [JsonPropertyName("senderName")]
        public string SenderName { get; set; }

        [JsonPropertyName("content")]
        public string Content { get; set; }

        [JsonPropertyName("timestamp")]
        public DateTime? Timestamp { get; set; }

        [JsonPropertyName("read")]
        public bool Read { get; set; }

        [JsonPropertyName("senderLevel")]
        public string SenderLevel { get; set; }
    }

    public class MessagesResponse
    {
        [JsonPropertyName("messages")]
        public List<MessageModel> Messages { get; set; } = new List<MessageModel>();

        [JsonPropertyName("conversationId")]
        public string ConversationId { get; set; }

        [JsonPropertyName("conversation")]
        public ConversationDetail Conversation { get; set; }
    }

}