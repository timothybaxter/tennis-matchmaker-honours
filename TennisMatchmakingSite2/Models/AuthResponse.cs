namespace TennisMatchmakingSite2.Models
{
    public class AuthResponse
    {
        public string Token { get; set; }
        public UserDto User { get; set; }
    }

    public class UserDto
    {
        public string Name { get; set; }
        public string Email { get; set; }
        public string PlayerLevel { get; set; }
        public string Theme { get; set; }  
    }

    public class ErrorResponse
    {
        public string Message { get; set; }
    }
}