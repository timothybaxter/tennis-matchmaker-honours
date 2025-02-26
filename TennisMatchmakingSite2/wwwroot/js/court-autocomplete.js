// simplified-court-autocomplete.js

// This is a standalone function that doesn't rely on external CSS or complex positioning
function setupCourtAutocomplete(inputSelector) {
    // Get the input element
    const input = document.querySelector(inputSelector);
    if (!input) {
        console.error('Input not found:', inputSelector);
        return;
    }

    console.log('Setting up autocomplete for:', inputSelector);

    // Create the dropdown container
    const dropdown = document.createElement('div');
    dropdown.style.position = 'absolute';
    dropdown.style.width = input.offsetWidth + 'px';
    dropdown.style.maxHeight = '200px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.backgroundColor = 'white';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    dropdown.style.zIndex = '9999';
    dropdown.style.display = 'none';
    dropdown.className = 'court-dropdown';

    // Calculate position right after the input
    const inputRect = input.getBoundingClientRect();
    dropdown.style.top = (inputRect.bottom + window.scrollY) + 'px';
    dropdown.style.left = (inputRect.left + window.scrollX) + 'px';

    // Add the dropdown to the document body (not as a child of another element)
    document.body.appendChild(dropdown);

    // Hard-coded test data
    const testCourts = [
        { id: '1', name: 'Dundee University Tennis Courts' },
        { id: '2', name: 'Dundee Indoor Tennis Club' },
        { id: '3', name: 'St Andrews Tennis Club' },
        { id: '4', name: 'Perth Tennis Club' },
        { id: '5', name: 'David Lloyd Tennis Centre' },
        { id: '6', name: 'Broughty Ferry Tennis Courts' }
    ];

    // Function to fill and show the dropdown
    function showDropdown(courts) {
        // Clear previous content
        dropdown.innerHTML = '';

        if (courts.length === 0) {
            const noResults = document.createElement('div');
            noResults.textContent = 'No courts found';
            noResults.style.padding = '8px 12px';
            noResults.style.color = '#666';
            dropdown.appendChild(noResults);
        } else {
            // Add each court as an option
            courts.forEach(court => {
                const option = document.createElement('div');
                option.textContent = court.name;
                option.style.padding = '8px 12px';
                option.style.cursor = 'pointer';
                option.style.borderBottom = '1px solid #eee';

                // Hover effect
                option.onmouseover = () => {
                    option.style.backgroundColor = '#f0f0f0';
                };
                option.onmouseout = () => {
                    option.style.backgroundColor = 'white';
                };

                // Click to select
                option.onclick = () => {
                    input.value = court.name;
                    dropdown.style.display = 'none';
                };

                dropdown.appendChild(option);
            });
        }

        // Show the dropdown
        dropdown.style.display = 'block';

        // Update position (in case page has scrolled)
        const rect = input.getBoundingClientRect();
        dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
        dropdown.style.left = (rect.left + window.scrollX) + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    // Filter function
    function filterCourts(query) {
        if (!query) return [];
        query = query.toLowerCase();
        return testCourts.filter(court =>
            court.name.toLowerCase().includes(query)
        );
    }

    // Input handler
    input.addEventListener('input', () => {
        const query = input.value.trim();

        if (query.length >= 2) {
            const matches = filterCourts(query);
            showDropdown(matches);
        } else {
            dropdown.style.display = 'none';
        }
    });

    // Double click to show all options
    input.addEventListener('dblclick', () => {
        showDropdown(testCourts);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (e.target !== input && e.target !== dropdown && !dropdown.contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Add a special test feature - click a button to show options
    const testButton = document.createElement('button');
    testButton.textContent = 'Show Courts';
    testButton.style.position = 'absolute';
    testButton.style.right = '5px';
    testButton.style.top = '50%';
    testButton.style.transform = 'translateY(-50%)';
    testButton.style.zIndex = '1000';
    testButton.style.background = 'transparent';
    testButton.style.border = 'none';
    testButton.style.color = '#666';
    testButton.style.cursor = 'pointer';
    testButton.style.fontSize = '12px';

    testButton.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDropdown(testCourts);
    };

    // Make the input container relative for positioning the button
    const inputParent = input.parentElement;
    if (getComputedStyle(inputParent).position === 'static') {
        inputParent.style.position = 'relative';
    }

    inputParent.appendChild(testButton);

    // Handle window resize
    window.addEventListener('resize', () => {
        if (dropdown.style.display === 'block') {
            const rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
            dropdown.style.left = (rect.left + window.scrollX) + 'px';
            dropdown.style.width = rect.width + 'px';
        }
    });

    console.log('Autocomplete setup complete for:', inputSelector);

    // Return functions for testing
    return {
        showAll: () => showDropdown(testCourts),
        updatePosition: () => {
            const rect = input.getBoundingClientRect();
            dropdown.style.top = (rect.bottom + window.scrollY) + 'px';
            dropdown.style.left = (rect.left + window.scrollX) + 'px';
            dropdown.style.width = rect.width + 'px';
        }
    };
}