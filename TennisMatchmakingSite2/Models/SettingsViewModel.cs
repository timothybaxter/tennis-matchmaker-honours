using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public class SettingsViewModel
    {
        [Required]
        [Display(Name = "Name")]
        public string Name { get; set; }

        [Required]
        [EmailAddress]
        [Display(Name = "Email")]
        public string Email { get; set; }

        [Display(Name = "Current Password")]
        [DataType(DataType.Password)]
        public string CurrentPassword { get; set; }

        [Display(Name = "New Password")]
        [DataType(DataType.Password)]
        [MinLength(6, ErrorMessage = "Password must be at least 6 characters long")]
        public string NewPassword { get; set; }

        [Display(Name = "Confirm New Password")]
        [DataType(DataType.Password)]
        [Compare("NewPassword", ErrorMessage = "The new password and confirmation password do not match.")]
        public string ConfirmNewPassword { get; set; }

        [Required]
        [Display(Name = "Player Level")]
        public PlayerLevel PlayerLevel { get; set; }

        [Required]
        [Display(Name = "Hometown")]
        public string Hometown { get; set; }

        [Display(Name = "Theme")]
        public GrandSlamTheme Theme { get; set; }
    }
}