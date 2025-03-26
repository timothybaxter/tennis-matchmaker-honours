

async function deleteMatch(matchId) {
    event.preventDefault();
    event.stopPropagation();

    if (!confirm('Are you sure you want to delete this match?')) {
        return;
    }

    try {
        const token = sessionStorage.getItem('jwtToken');
        const response = await fetch(`${window.API_BASE_URL}/matches/${matchId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const card = document.querySelector(`[data-match-id="${matchId}"]`);
            if (card) {
                card.remove();
            }
        } else {
            throw new Error('Failed to delete match');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to delete match. Please try again.');
    }
}
// Delete functionality
async function deleteMatchFromApi(matchId) {
    if (!confirm('Are you sure you want to delete this match?')) {
        return;
    }

    try {
        const token = sessionStorage.getItem('jwtToken');
        const response = await fetch(`${window.API_BASE_URL}/matches/${matchId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (response.ok) {
            const card = document.querySelector(`[data-match-id="${matchId}"]`);
            if (card) {
                card.remove();
            }
        } else {
            throw new Error('Failed to delete match');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to delete match. Please try again.');
    }
}

function showFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const backdrop = document.getElementById('filterBackdrop');

    if (!panel || !backdrop) {
        console.error('Filter panel elements not found');
        return;
    }

    backdrop.classList.remove('hidden');
    // Force a reflow
    panel.offsetHeight;
    requestAnimationFrame(() => {
        panel.classList.remove('translate-x-full');
    });

    document.body.style.overflow = 'hidden';
}

function hideFilterPanel() {
    const panel = document.getElementById('filterPanel');
    const backdrop = document.getElementById('filterBackdrop');

    if (!panel || !backdrop) {
        console.error('Filter panel elements not found');
        return;
    }

    panel.classList.add('translate-x-full');

    setTimeout(() => {
        backdrop.classList.add('hidden');
        document.body.style.overflow = '';
    }, 300);
}

// Create match modal functionality
function showCreateMatchModal() {
    const modal = document.getElementById('createMatchModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideCreateMatchModal() {
    const modal = document.getElementById('createMatchModal');
    if (!modal) return;

    modal.classList.add('hidden');
    document.body.style.overflow = '';
}

// Placeholder functions
// Message user function
function messageUser(userId, userName) {
    if (!userId) {
        console.error('No user ID provided for messaging');
        return;
    }
    // Prevent card toggle
    event.stopPropagation();

    // Navigate to new conversation page
    window.location.href = "/Social/NewConversation?userId=" + userId + "&userName=" + encodeURIComponent(userName);
}

function viewProfile(userId) {
    if (!userId) {
        console.error('No user ID provided for profile view');
        return;
    }
    // Prevent card toggle
    event.stopPropagation();

    // Navigate to profile page
    window.location.href = "/Profile/ViewProfile/" + userId;
}
// Event Listeners when document loads
document.addEventListener('DOMContentLoaded', function () {
    const modal = document.getElementById('createMatchModal');
    const backdrop = document.getElementById('filterBackdrop');

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                hideCreateMatchModal();
            }
        });
    }

    if (backdrop) {
        backdrop.addEventListener('click', hideFilterPanel);
    }
});