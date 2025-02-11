using System;
using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public class UpdateMatchViewModel
    {
        [Required]
        public string CourtLocation { get; set; }

        [Required]
        public DateTime MatchTime { get; set; }

        [Required]
        public string MatchType { get; set; }

        // Optional fields that might be updated
        public string Status { get; set; }
        public string PlayerLevel { get; set; }
    }
}