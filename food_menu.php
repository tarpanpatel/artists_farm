<?php
/**
 * Public, no-login "Share Menu" page - one property's live food menu.
 *
 * Reuses the shared DB bootstrap + property-slug resolver (php/config/
 * database.php -> property_resolver.php) instead of the hand-rolled
 * credentials/connection this file used to duplicate, so it picks up the
 * exact same local/staging/production DB selection logic as every other
 * endpoint rather than its own separately-maintained (and already stale -
 * db name/user 'artist_farm' matched neither the real cPanel 'groundcode'
 * DB nor local 'artists_farm_resort') copy.
 *
 * Property is resolved from ?property_slug=... (see .htaccess's
 * food_menu/{slug}/ rewrite) via getCurrentPropertyId()'s normal priority
 * chain - a bare /food_menu/ with no slug falls back to that function's own
 * site-default property rather than erroring, so old unscoped links keep
 * showing *a* menu instead of breaking outright.
 *
 * Always queries menu_items live - there is no separate "generate" step to
 * wire up here. A save in Edit Food Menu (MenuManager.tsx) is already
 * reflected on next visit for free, with no caching to invalidate.
 */

require_once __DIR__ . '/php/config/database.php';

// database.php sets Content-Type: application/json (it's shared by every
// JSON API endpoint) - this page renders HTML, so override before any output.
header('Content-Type: text/html; charset=UTF-8');

$propertyId = getCurrentPropertyId($pdo);
$currentProperty = $propertyId > 0 ? getCurrentProperty($pdo, $propertyId) : [];

$pageTitle = 'Our Menu';
$restaurantName = $currentProperty['name'] ?? 'Our Restaurant';
$tagline = 'Authentic flavors crafted with care';

$categories = [];
if ($propertyId > 0) {
    try {
        $stmt = $pdo->prepare("
            SELECT m.id, m.name, m.price, m.is_hidden, c.name AS category_name, c.sort_order
            FROM menu_items m
            LEFT JOIN menu_categories c ON m.category_id = c.id
            WHERE m.is_hidden = 0 AND m.property_id = ?
            ORDER BY c.sort_order ASC, m.name ASC
        ");
        $stmt->execute([$propertyId]);
        $menuItems = $stmt->fetchAll();

        foreach ($menuItems as $item) {
            $categoryName = $item['category_name'] ?: 'Other';
            $categories[$categoryName][] = $item;
        }
    } catch (Exception $e) {
        $categories = [];
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0">
    <title><?= htmlspecialchars($pageTitle) ?> - <?= htmlspecialchars($restaurantName) ?></title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <!-- Non-render-blocking (25 Aug 2026, same fix as index.html/home.html/
         index3.html): a plain <link rel="stylesheet"> here would hold the
         whole page blank until this third-party fetch completes - and this
         page is guest-facing, opened cold off a QR-code scan on cellular,
         the exact conditions that make that round trip most painful. -->
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" media="print" onload="this.media='all'; this.onload=null;">
    <noscript><link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"></noscript>
    <style>
        :root {
          --bg-page: #f8f6f0;
          --bg-card: #ffffff;
          --text-primary: #1a1a1a;
          --text-secondary: #5a5a5a;
          --text-muted: #8c8c8c;
          --border-color: #e5dfd3;
          --accent-gold: #9e7d3b;
          --accent-gold-light: #f4ede0;
          --accent-gold-dark: #7a5f28;
          --font-heading: 'Cinzel', 'Georgia', serif;
          --font-body: 'Inter', system-ui, -apple-system, sans-serif;
        }

        *, *::before, *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        html {
          scroll-behavior: smooth;
          -webkit-text-size-adjust: 100%;
        }

        body {
          font-family: var(--font-body);
          background-color: var(--bg-page);
          color: var(--text-primary);
          line-height: 1.5;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          overflow-x: hidden;
        }

        /* Hero Header */
        .menu-hero {
          background: linear-gradient(180deg, #1c1917 0%, #292524 100%);
          color: #ffffff;
          text-align: center;
          padding: clamp(28px, 6vw, 48px) 16px clamp(24px, 5vw, 40px);
          position: relative;
          border-bottom: 2px solid var(--accent-gold);
        }

        .menu-hero::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 80px;
          height: 3px;
          background: var(--accent-gold);
        }

        .restaurant-name {
          font-family: var(--font-heading);
          font-size: clamp(22px, 5vw, 34px);
          font-weight: 700;
          letter-spacing: clamp(1.5px, 0.4vw, 3px);
          text-transform: uppercase;
          color: #ffffff;
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .menu-subtitle {
          font-size: clamp(12px, 2.8vw, 14px);
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #d6cfb8;
          font-weight: 500;
        }

        /* Sticky Filter & Search Toolbar */
        .toolbar-sticky {
          position: sticky;
          top: 0;
          z-index: 40;
          background: rgba(248, 246, 240, 0.96);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-bottom: 1px solid var(--border-color);
          padding: 10px 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
        }

        .toolbar-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .search-wrap {
          position: relative;
          width: 100%;
        }

        .search-input {
          width: 100%;
          padding: 9px 14px 9px 36px;
          border-radius: 9999px;
          border: 1px solid var(--border-color);
          background-color: #ffffff;
          font-family: var(--font-body);
          font-size: 14px;
          color: var(--text-primary);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .search-input:focus {
          border-color: var(--accent-gold);
          box-shadow: 0 0 0 3px rgba(158, 125, 59, 0.15);
        }

        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
          width: 16px;
          height: 16px;
          pointer-events: none;
        }

        .category-pills-bar {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          white-space: nowrap;
          padding-bottom: 2px;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .category-pills-bar::-webkit-scrollbar {
          display: none;
        }

        .cat-pill {
          display: inline-block;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 12.5px;
          font-weight: 600;
          letter-spacing: 0.5px;
          text-decoration: none;
          background: #ffffff;
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
          cursor: pointer;
          transition: all 0.2s ease;
          user-select: none;
        }

        .cat-pill:hover {
          color: var(--accent-gold-dark);
          border-color: var(--accent-gold);
        }

        .cat-pill.active {
          background: var(--accent-gold);
          color: #ffffff;
          border-color: var(--accent-gold);
          box-shadow: 0 2px 6px rgba(158, 125, 59, 0.25);
        }

        /* Menu Content Area */
        .menu-main {
          flex: 1;
          padding: 24px 16px 48px;
        }

        .container {
          max-width: 1100px;
          margin: 0 auto;
        }

        /* Responsive Grid: 1 column on mobile, 2 on tablet/desktop */
        .menu-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 24px;
        }

        @media (min-width: 768px) {
          .menu-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 28px;
          }
        }

        @media (min-width: 1120px) {
          .menu-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 36px;
          }
        }

        /* Category Box */
        .menu-category {
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          padding: 20px 18px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
          break-inside: avoid;
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .menu-category-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 12px;
          margin-bottom: 12px;
          border-bottom: 2px solid var(--accent-gold-light);
        }

        .category-title {
          font-family: var(--font-heading);
          font-size: 16px;
          font-weight: 700;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: var(--text-primary);
        }

        .category-count {
          font-size: 11px;
          font-weight: 600;
          color: var(--accent-gold-dark);
          background: var(--accent-gold-light);
          padding: 2px 8px;
          border-radius: 9999px;
        }

        /* Menu Rows */
        .menu-items-list {
          display: flex;
          flex-direction: column;
        }

        .menu-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
          gap: 12px;
          transition: background-color 0.15s;
        }

        .menu-row:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }

        .menu-row:first-child {
          padding-top: 2px;
        }

        .dish-name {
          flex: 1;
          min-width: 0;
          font-size: 14.5px;
          font-weight: 500;
          color: var(--text-primary);
          line-height: 1.4;
          word-break: break-word;
        }

        .dish-price {
          font-weight: 700;
          font-size: 14.5px;
          color: var(--text-primary);
          white-space: nowrap;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.2px;
        }

        /* Empty State */
        .empty-state {
          text-align: center;
          padding: 60px 20px;
          background: var(--bg-card);
          border-radius: 12px;
          border: 1px solid var(--border-color);
          max-width: 540px;
          margin: 30px auto;
        }

        .empty-state h2 {
          font-family: var(--font-heading);
          font-size: 1.35rem;
          margin-bottom: 8px;
          color: var(--text-primary);
        }

        .empty-state p {
          color: var(--text-secondary);
          font-size: 14px;
        }

        /* Footer */
        footer {
          text-align: center;
          padding: 24px 16px;
          color: var(--text-muted);
          font-size: 12.5px;
          border-top: 1px solid var(--border-color);
          background: #ffffff;
          margin-top: auto;
        }

        /* Mobile specifics */
        @media (max-width: 480px) {
          .menu-main {
            padding: 16px 12px 36px;
          }
          .menu-category {
            padding: 16px 14px;
            border-radius: 10px;
          }
          .category-title {
            font-size: 15px;
          }
          .dish-name {
            font-size: 14px;
          }
          .dish-price {
            font-size: 14px;
          }
        }
    </style>
</head>
<body>
    <div class="menu-hero">
      <h1 class="restaurant-name"><?= htmlspecialchars($restaurantName) ?></h1>
      <div class="menu-subtitle">Food Menu</div>
    </div>

    <?php if (!empty($categories)): ?>
    <div class="toolbar-sticky">
      <div class="toolbar-inner">
        <div class="search-wrap">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
          </svg>
          <input type="search" id="menuSearch" class="search-input" placeholder="Search dishes..." autocomplete="off">
        </div>
        <div class="category-pills-bar" id="categoryPills">
          <button type="button" class="cat-pill active" data-target="all">All</button>
          <?php foreach ($categories as $categoryName => $items): ?>
            <button type="button" class="cat-pill" data-target="cat-<?= md5($categoryName) ?>">
              <?= htmlspecialchars($categoryName) ?> (<?= count($items) ?>)
            </button>
          <?php endforeach; ?>
        </div>
      </div>
    </div>
    <?php endif; ?>

    <main class="menu-main">
      <div class="container">
        <?php if (empty($categories)): ?>
            <div class="empty-state">
                <h2>Menu Coming Soon</h2>
                <p>We're preparing something delicious for you. Please check back later.</p>
            </div>
        <?php else: ?>
            <div class="menu-grid" id="menuGrid">
                <?php foreach ($categories as $categoryName => $items): ?>
                    <section class="menu-category" id="cat-<?= md5($categoryName) ?>" data-category="<?= htmlspecialchars($categoryName) ?>">
                        <div class="menu-category-header">
                            <h2 class="category-title"><?= htmlspecialchars($categoryName) ?></h2>
                            <span class="category-count"><?= count($items) ?> items</span>
                        </div>
                        <div class="menu-items-list">
                            <?php foreach ($items as $item): ?>
                                <div class="menu-row" data-name="<?= strtolower(htmlspecialchars($item['name'])) ?>">
                                    <span class="dish-name"><?= htmlspecialchars($item['name']) ?></span>
                                    <span class="dish-price">&#8377;<?= number_format($item['price'], 2) ?></span>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </section>
                <?php endforeach; ?>
            </div>
            <div id="noResults" class="empty-state" style="display: none;">
                <h2>No dishes found</h2>
                <p>Try searching for a different dish name.</p>
            </div>
        <?php endif; ?>
      </div>
    </main>

    <footer>
        <p>&copy; <?= date('Y') ?> <?= htmlspecialchars($restaurantName) ?>. All rights reserved.</p>
    </footer>

    <script>
      (function() {
        const searchInput = document.getElementById('menuSearch');
        const categoryPills = document.querySelectorAll('.cat-pill');
        const categories = document.querySelectorAll('.menu-category');
        const noResults = document.getElementById('noResults');
        let activeCategoryTarget = 'all';

        function filterMenu() {
          const query = searchInput ? searchInput.value.trim().toLowerCase() : '';
          let totalVisible = 0;

          categories.forEach(cat => {
            const catId = cat.id;
            const categoryMatchesFilter = (activeCategoryTarget === 'all' || activeCategoryTarget === catId);
            
            if (!categoryMatchesFilter) {
              cat.style.display = 'none';
              return;
            }

            const rows = cat.querySelectorAll('.menu-row');
            let visibleInCat = 0;

            rows.forEach(row => {
              const name = row.getAttribute('data-name') || '';
              if (!query || name.includes(query)) {
                row.style.display = 'flex';
                visibleInCat++;
              } else {
                row.style.display = 'none';
              }
            });

            if (visibleInCat > 0) {
              cat.style.display = 'block';
              totalVisible += visibleInCat;
            } else {
              cat.style.display = 'none';
            }
          });

          if (noResults) {
            noResults.style.display = totalVisible === 0 ? 'block' : 'none';
          }
        }

        if (searchInput) {
          searchInput.addEventListener('input', filterMenu);
        }

        categoryPills.forEach(pill => {
          pill.addEventListener('click', function() {
            categoryPills.forEach(p => p.classList.remove('active'));
            this.classList.add('active');
            activeCategoryTarget = this.getAttribute('data-target') || 'all';
            filterMenu();

            if (activeCategoryTarget !== 'all') {
              const targetElem = document.getElementById(activeCategoryTarget);
              if (targetElem) {
                const headerOffset = 130;
                const elementPosition = targetElem.getBoundingClientRect().top;
                const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
                window.scrollTo({ top: offsetPosition, behavior: 'smooth' });
              }
            }
          });
        });
      })();
    </script>
</body>
</html>
