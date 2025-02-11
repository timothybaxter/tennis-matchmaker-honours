using System;
using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public class MatchViewModel
    {
        [Required]
        [Display(Name = "Court Location")]
        public string CourtLocation { get; set; }

        [Required]
        [Display(Name = "Match Time")]
        public DateTime MatchTime { get; set; }

        [Required]
        [Display(Name = "Match Type")]
        public string MatchType { get; set; }
    }
}