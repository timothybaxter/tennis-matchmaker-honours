using System.Text.Json.Serialization;

namespace TennisMatchmakingSite2.Models
{
    public class AuthResponse
    {
        public string Token { get; set; }
        public UserDto User { get; set; }
    }

    public class UserDto
    {
        public string Id { get; set; }
        public string Name { get; set; }
        public string Email { get; set; }
        public string PlayerLevel { get; set; }
        public string Theme { get; set; }
    }

    public class ErrorResponse
    {
        public string Message { get; set; }
    }
 
        public class TokenPayload
        {
            [JsonPropertyName("userId")]
            public string userId { get; set; }

            [JsonPropertyName("email")]
            public string email { get; set; }

            [JsonPropertyName("iat")]
            public long iat { get; set; }

            [JsonPropertyName("exp")]
            public long exp { get; set; }
        }
 }
