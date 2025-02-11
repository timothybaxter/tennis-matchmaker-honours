$(document).ready(function () {
    // Form validation
    $("#createMatchForm").validate({
        rules: {
            CourtLocation: "required",
            MatchTime: "required",
            MatchType: "required"
        },
        messages: {
            CourtLocation: "Please enter a court location",
            MatchTime: "Please select a match time",
            MatchType: "Please select a match type"
        },
        errorClass: "invalid-feedback",
        errorElement: "div",
        highlight: function (element) {
            $(element).addClass("is-invalid");
        },
        unhighlight: function (element) {
            $(element).removeClass("is-invalid");
        }
    });
});
});