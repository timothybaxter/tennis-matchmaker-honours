using System;
using System.ComponentModel.DataAnnotations;
namespace TennisMatchmakingSite2.Models
{
    public class CreateMatchViewModel
    {

        [Required]
        public string CourtLocation { get; set; } = "";

            [Required]
            public DateTime MatchTime { get; set; } = DateTime.Now;

        [Required]
        public string MatchType { get; set; } = "singles";
       
    }
}