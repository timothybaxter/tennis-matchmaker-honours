// tournament-scripts.js - Script for tournament functionality

// Profile View Functions
function viewProfile(userId) {
    window.location.href = `/Profile/View/${userId}`;
}

function viewMatchHistory(userId) {
    window.location.href = `/Profile/MatchHistory/${userId}`;
}

function messageUser(userId) {
    window.location.href = `/Social/NewConversation?recipientId=${userId}`;
}

// Tournament Functions
function joinTournament(tournamentId) {
    if (confirm('Are you sure you want to join this tournament?')) {
        document.getElementById('joinTournamentForm').action = `/Tournaments/Join/${tournamentId}`;
        document.getElementById('joinTournamentForm').submit();
    }
}

function leaveTournament(tournamentId) {
    if (confirm('Are you sure you want to leave this tournament? You will lose your current position.')) {
        document.getElementById('leaveTournamentForm').action = `/Tournaments/Leave/${tournamentId}`;
        document.getElementById('leaveTournamentForm').submit();
    }
}

function startTournament(tournamentId) {
    if (confirm('Are you sure you want to start this tournament? This will generate the brackets and no more players will be able to join.')) {
        document.getElementById('startTournamentForm').action = `/Tournaments/Start/${tournamentId}`;
        document.getElementById('startTournamentForm').submit();
    }
}

// Ladder Functions
function joinLadder(ladderId) {
    if (confirm('Are you sure you want to join this ladder?')) {
        document.getElementById('joinLadderForm').action = `/Tournaments/JoinLadder/${ladderId}`;
        document.getElementById('joinLadderForm').submit();
    }
}

function leaveLadder(ladderId) {
    if (confirm('Are you sure you want to leave this ladder? You will lose your current ranking.')) {
        document.getElementById('leaveLadderForm').action = `/Tournaments/LeaveLadder/${ladderId}`;
        document.getElementById('leaveLadderForm').submit();
    }
}

function challengePlayer(ladderId, opponentId, opponentName) {
    if (confirm(`Are you sure you want to challenge ${opponentName}?`)) {
        document.getElementById('challengePlayerId').value = opponentId;
        document.getElementById('challengeLadderId').value = ladderId;
        document.getElementById('challengePlayerForm').submit();
    }
}

// Match Results Functions
function validateMatchScores(formId) {
    const form = document.getElementById(formId);
    if (!form) return true;

    const winnerRadios = form.querySelectorAll('input[name="winner"]');
    let winnerSelected = false;

    for (const radio of winnerRadios) {
        if (radio.checked) {
            winnerSelected = true;
            break;
        }
    }

    if (!winnerSelected) {
        alert('Please select a winner');
        return false;
    }

    // Validate scores make sense for the winner
    const winner = form.querySelector('input[name="winner"]:checked').value;
    const sets = form.querySelectorAll('.set-score');
    let player1Wins = 0;
    let player2Wins = 0;

    sets.forEach(set => {
        const inputs = set.querySelectorAll('input[type="number"]');
        if (inputs.length === 2) {
            const player1Score = parseInt(inputs[0].value);
            const player2Score = parseInt(inputs[1].value);

            if (player1Score > player2Score) {
                player1Wins++;
            } else if (player2Score > player1Score) {
                player2Wins++;
            }
        }
    });

    const expectedWinner = player1Wins > player2Wins ? 'me' : 'opponent';

    if (winner !== expectedWinner) {
        if (!confirm('The scores you entered do not match the winner you selected. Are you sure you want to continue?')) {
            return false;
        }
    }

    return true;
}

// Registration for event handlers
document.addEventListener('DOMContentLoaded', function () {
    // Match result form validation
    const tournamentForm = document.getElementById('tournamentResultForm');
    if (tournamentForm) {
        tournamentForm.addEventListener('submit', function (e) {
            if (!validateMatchScores('tournamentResultForm')) {
                e.preventDefault();
            }
        });
    }

    const ladderForm = document.getElementById('ladderResultForm');
    if (ladderForm) {
        ladderForm.addEventListener('submit', function (e) {
            if (!validateMatchScores('ladderResultForm')) {
                e.preventDefault();
            }
        });
    }
});