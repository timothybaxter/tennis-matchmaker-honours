

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
function messageUser(userName) {
    alert('Messaging functionality coming soon');
}

function requestMatch(matchId) {
    alert('Match request functionality coming soon');
}

function viewProfile(userName) {
    alert('Profile view functionality coming soon');
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