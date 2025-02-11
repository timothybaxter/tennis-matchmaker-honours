// MatchFilterModel.cs
using System;

namespace TennisMatchmakingSite2.Models
{
    public class MatchFilterModel
    {
        public string? CourtLocation { get; set; }
        public string? MatchType { get; set; }
        public string Status { get; set; }
        public string? SkillLevel { get; set; }
        public DateTime? MatchDate { get; set; }
    }
}