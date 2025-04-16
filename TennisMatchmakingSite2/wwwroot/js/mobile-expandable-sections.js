// mobile-expandable-sections.js
document.addEventListener('DOMContentLoaded', function() {
  // Only apply on mobile devices
  function setupMobileExpandableSections() {
    // Check if we're on a mobile device (screen width less than 768px)
    const isMobile = window.innerWidth < 768;
    
    // Get all section cards that should be expandable
    const sectionCards = document.querySelectorAll('.expandable-section');
    
    sectionCards.forEach(card => {
      const header = card.querySelector('.section-header');
      const content = card.querySelector('.section-content');
      const indicator = card.querySelector('.expand-indicator');
      
      // If we're on mobile, hide content initially
      if (isMobile && !card.classList.contains('always-expanded')) {
        content.classList.add('hidden');
        if (indicator) {
          indicator.classList.remove('rotate-180');
        }
      } else {
        // On desktop, make sure content is visible
        content.classList.remove('hidden');
        if (indicator) {
          indicator.classList.add('rotate-180');
        }
      }
      
      // Add click handler to toggle visibility
      if (header) {
        header.addEventListener('click', function() {
          // Only toggle on mobile
          if (window.innerWidth < 768) {
            content.classList.toggle('hidden');
            
            // Animate the indicator if it exists
            if (indicator) {
              indicator.classList.toggle('rotate-180');
            }
          }
        });
      }
    });
  }
  
  // Run on page load
  setupMobileExpandableSections();
  
  // Also run when window is resized
  window.addEventListener('resize', function() {
    setupMobileExpandableSections();
  });
});