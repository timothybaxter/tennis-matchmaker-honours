// Match card expansion
function toggleMatchExpand(element) {
    const card = element.closest('.match-card');
    const actions = card.querySelector('.match-actions');
    const icon = card.querySelector('.expand-icon');

    if (actions && icon) {
        actions.classList.toggle('hidden');
        if (actions.classList.contains('hidden')) {
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        } else {
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        }
    }
}

// Create match modal
function showCreateMatchModal() {
    const modal = document.getElementById('createMatchModal');
    modal.classList.remove('hidden');
}

function hideCreateMatchModal() {
    const modal = document.getElementById('createMatchModal');
    modal.classList.add('hidden');
}

// Mobile filter panel
function showFilterPanel() {
    const filterPanel = document.getElementById('filterPanel');
    filterPanel.classList.remove('hidden');
}

function hideFilterPanel() {
    const filterPanel = document.getElementById('filterPanel');
    filterPanel.classList.add('hidden');
}

// Match actions
function deleteMatch(matchId) {
    if (confirm('Are you sure you want to delete this match?')) {
        const form = document.createElement('form');
        form.method = 'POST';
        form.action = '/Match/Delete';

        const matchIdInput = document.createElement('input');
        matchIdInput.type = 'hidden';
        matchIdInput.name = 'matchId';
        matchIdInput.value = matchId;

        form.appendChild(matchIdInput);
        document.body.appendChild(form);
        form.submit();
    }
}

function messageUser(userName) {
    alert('Messaging functionality coming soon');
}

function requestMatch(matchId) {
    alert('Match request functionality coming soon');
}

// Initialize event listeners when the document loads
document.addEventListener('DOMContentLoaded', function () {
    // Filter panel buttons
    const openFilterBtn = document.getElementById('openFilterPanel');
    const closeFilterBtn = document.getElementById('closeFilterPanel');

    if (openFilterBtn) {
        openFilterBtn.addEventListener('click', showFilterPanel);
    }
    if (closeFilterBtn) {
        closeFilterBtn.addEventListener('click', hideFilterPanel);
    }

    // Add click listeners to match cards
    document.querySelectorAll('.match-card').forEach(card => {
        const clickableArea = card.querySelector('.clickable-area');
        if (clickableArea) {
            clickableArea.addEventListener('click', function () {
                toggleMatchExpand(this);
            });
        }
    });
});