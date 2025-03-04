using System.Collections.Generic;
using System;
using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class NotificationModel
    {
        [JsonPropertyName("_id")]
        public string Id { get; set; } = string.Empty;

        [JsonPropertyName("userId")]
        public string UserId { get; set; } = string.Empty;

        [JsonPropertyName("sourceUserId")]
        public string SourceUserId { get; set; } = string.Empty;

        [JsonPropertyName("sourceUserName")]
        public string SourceUserName { get; set; } 

        [JsonPropertyName("type")]
        public string Type { get; set; } = string.Empty;

        [JsonPropertyName("content")]
        public string Content { get; set; } = string.Empty;

        [JsonPropertyName("relatedItemId")]
        public string? RelatedItemId { get; set; }

        [JsonPropertyName("isRead")]
        public bool IsRead { get; set; }

        [JsonPropertyName("createdAt")]
        public DateTime CreatedAt { get; set; }
    }

    public class NotificationsResponse
    {
        [JsonPropertyName("notifications")]
        public List<NotificationModel> Notifications { get; set; } = new List<NotificationModel>();
    }
}