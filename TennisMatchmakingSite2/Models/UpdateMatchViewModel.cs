using System;
using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public class UpdateMatchViewModel
    {
        [Required]
        public string MatchId { get; set; }  

        [Required]
        public string CourtLocation { get; set; }

        [Required]
        public DateTime MatchTime { get; set; }

        [Required]
        public string MatchType { get; set; }

        public string Status { get; set; }
        public string PlayerLevel { get; set; }
    }
}