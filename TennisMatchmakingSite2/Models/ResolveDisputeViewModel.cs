using System;
using System.ComponentModel.DataAnnotations;
namespace TennisMatchmakingSite2.Models
{
	public class ResolveDisputeViewModel
	{
		[Required]
		public string Resolution { get; set; }

		public List<ScoreSet> Scores { get; set; }

		public string Winner { get; set; }
	}
}