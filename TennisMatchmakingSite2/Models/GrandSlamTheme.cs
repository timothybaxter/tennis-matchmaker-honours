using System.ComponentModel.DataAnnotations;

namespace TennisMatchmakingSite2.Models
{
    public enum GrandSlamTheme
    {
        [Display(Name = "Wimbledon")]
        Wimbledon,

        [Display(Name = "Roland Garros")]
        RolandGarros,

        [Display(Name = "US Open")]
        USOpen,

        [Display(Name = "Australian Open")]
        AustralianOpen
    }
}