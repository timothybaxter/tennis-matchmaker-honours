using System;
using System.ComponentModel.DataAnnotations;
namespace TennisMatchmakingSite2.Models
{
    public class CreateMatchViewModel
    {
       
            [Required]
            public string CourtLocation { get; set; }

            [Required]
            public DateTime MatchTime { get; set; }

            [Required]
            public string MatchType { get; set; }
       
    }
}