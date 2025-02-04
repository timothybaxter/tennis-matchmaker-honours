namespace TennisMatchmakingSite.Models
{
    public class AuthResponse
    {
        public string Token { get; set; }
        public UserData User { get; set; }
    }

    public class UserData
    {
        public string Email { get; set; }
        public string Name { get; set; }
    }

    public class ErrorResponse
    {
        public string Message { get; set; }
    }
}