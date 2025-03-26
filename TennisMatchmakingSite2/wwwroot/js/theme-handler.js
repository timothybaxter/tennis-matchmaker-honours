// wwwroot/js/theme-handler.js

const themes = {
    Wimbledon: {
        navbarColor: '#64408a',
        backgroundImage: '/images/court_background_green.png',
        bottomNavColor: '#64408a',
        bottomNavLinkColor: 'rgba(255, 255, 255, 0.7)',
        bottomNavLinkHoverColor: 'rgba(255, 255, 255, 0.9)',
        bottomNavLinkActiveColor: 'white',
        iconColor: 'white'
    },
    RolandGarros: {
        navbarColor: '#084e2e',
        backgroundImage: '/images/court_background_clay.png',
        bottomNavColor: '#084e2e',
        bottomNavLinkColor: 'rgba(255, 255, 255, 0.7)',
        bottomNavLinkHoverColor: 'rgba(255, 255, 255, 0.9)',
        bottomNavLinkActiveColor: 'white',
        iconColor: 'white'
    },
    USOpen: {
        navbarColor: '#426892',
        backgroundImage: '/images/court_background_hard.png',
        bottomNavColor: '#426892',
        bottomNavLinkColor: 'rgba(0, 0, 0, 0.7)',
        bottomNavLinkHoverColor: 'rgba(0, 0, 0, 0.9)',
        bottomNavLinkActiveColor: 'white',
        iconColor: 'white'
    },
    AustralianOpen: {
        navbarColor: '#e9f7ff',
        backgroundImage: '/images/court_background_blue.png',
        bottomNavColor: '#e9f7ff',
        bottomNavLinkColor: 'rgba(0, 0, 0, 0.7)',
        bottomNavLinkHoverColor: 'rgba(0, 0, 0, 0.9)',
        bottomNavLinkActiveColor: 'black',
        iconColor: 'black'
    }
};

window.applyTheme = function (themeName) {
    const theme = themes[themeName];
    if (!theme) return;

    // Update header color
    const header = document.querySelector('.header');
    if (header) {
        header.style.backgroundColor = theme.navbarColor;
    }

    // Update bottom navigation
    const bottomNav = document.querySelector('.bottom-nav');
    if (bottomNav) {
        bottomNav.style.backgroundColor = theme.bottomNavColor;

        // Update navigation links and icons
        const links = bottomNav.querySelectorAll('a');
        links.forEach(link => {
            link.style.color = theme.bottomNavLinkColor;

            // Update icon color
            const icon = link.querySelector('[data-lucide]');
            if (icon) {
                icon.setAttribute('color', theme.iconColor);
                // Re-render the icon with new color
                lucide.createIcons({
                    icons: [icon.getAttribute('data-lucide')],
                    elementsToUpdate: [icon]
                });
            }

            // Remove existing event listeners
            const newLink = link.cloneNode(true);
            link.parentNode.replaceChild(newLink, link);

            // Add hover effect
            newLink.addEventListener('mouseenter', () => {
                newLink.style.color = theme.bottomNavLinkHoverColor;
            });

            newLink.addEventListener('mouseleave', () => {
                newLink.style.color = theme.bottomNavLinkColor;
                if (newLink.classList.contains('active')) {
                    newLink.style.color = theme.bottomNavLinkActiveColor;
                }
            });

            // Set active link color
            if (newLink.classList.contains('active')) {
                newLink.style.color = theme.bottomNavLinkActiveColor;
            }

            // Re-render icon for the new link
            const newIcon = newLink.querySelector('[data-lucide]');
            if (newIcon) {
                newIcon.setAttribute('color', theme.iconColor);
                lucide.createIcons({
                    icons: [newIcon.getAttribute('data-lucide')],
                    elementsToUpdate: [newIcon]
                });
            }
        });
    }

    // Update background image
    const bgTennis = document.querySelector('.bg-tennis');
    if (bgTennis) {
        bgTennis.style.backgroundImage = `url(${theme.backgroundImage})`;
    }
};


window.getThemeColors = function (themeName) {
    if (!themeName) {
        const themeElement = document.getElementById('theme-data');
        if (themeElement) {
            themeName = themeElement.getAttribute('data-theme');
        }
    }

    // Default to Wimbledon if no theme found
    const theme = themes[themeName] || themes.Wimbledon;

    // Return an object with the essential theme colors
    return {
        primary: theme.navbarColor,
        background: theme.backgroundImage,
        textColor: themeName === 'AustralianOpen' ? '#000000' : '#ffffff'
    };
};

// Listen for theme changes
document.addEventListener('themeChanged', function (e) {
    window.applyTheme(e.detail.theme);
});
