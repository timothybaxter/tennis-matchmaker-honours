using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public class RegisterViewModel
    {
        [Required]
        public string Name { get; set; }

        [Required]
        [EmailAddress]
        public string Email { get; set; }

        [Required]
        [DataType(DataType.Password)]
        public string Password { get; set; }

        [Required]
        [Compare("Password")]
        [Display(Name = "Confirm Password")]
        [DataType(DataType.Password)]
        public string ConfirmPassword { get; set; }

        [Required]
        [Display(Name = "Player Level")]
        public PlayerLevel PlayerLevel { get; set; }
    }

    public enum PlayerLevel
    {
        Beginner,
        Casual,
        Intermediate,
        Competitive,
        Advanced
    }
}