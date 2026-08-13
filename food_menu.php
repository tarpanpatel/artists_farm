<?php
$server_name = $_SERVER['SERVER_NAME'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';

if ($server_name === 'localhost' || $server_name === '127.0.0.1' || str_contains($server_name, '192.168.')) {
    $db_host = 'localhost';
    $live_db = 'artists_farm_resort';
    $db_user = 'root';
    $db_pass = '';
} else {
    $db_host = 'localhost';
    $live_db = 'artists_farm';
    $db_user = 'artist_farm';
    $db_pass = getenv('DB_PASSWORD') ?: (file_exists(__DIR__ . '/php/config/db_pass.php') ? require __DIR__ . '/php/config/db_pass.php' : 'tPatel13@');
}

$dbname = $live_db;

$pageTitle = 'Our Menu';
$restaurantName = 'Ground Code Resort';
$tagline = 'Authentic flavors crafted with care';

try {
    $pdo = new PDO("mysql:host=$db_host;dbname=$dbname;charset=utf8mb4", $db_user, $db_pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $stmt = $pdo->query("
        SELECT m.id, m.name, m.price, m.is_hidden, c.name AS category_name, c.sort_order
        FROM menu_items m
        LEFT JOIN menu_categories c ON m.category_id = c.id
        WHERE m.is_hidden = 0
        ORDER BY c.sort_order ASC, m.name ASC
    ");
    $menuItems = $stmt->fetchAll();

    $categories = [];
    foreach ($menuItems as $item) {
        $categoryName = $item['category_name'] ?: 'Other';
        $categories[$categoryName][] = $item;
    }
} catch (Exception $e) {
    $categories = [];
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle) ?> - <?= htmlspecialchars($restaurantName) ?></title>
    <style>
         :root {
          --bg: #eeecec;
          --accent: #999c68;
          --accent-dark: #6a6a3a;
          --black: #000000;
          --gray: #6a6a6a;
          --footer-bg: #888888;
          --white: #ffffff;
          --font-display: 'Georgia', 'Times New Roman', serif;
          --font-body: 'Trebuchet MS', 'Lucida Sans', sans-serif;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        body {
          font-family: var(--font-body);
          background-color: var(--bg);
          color: var(--black);
          overflow-x: hidden;
        }

        .menu-hero {
          position: relative;
          width: 100%;
          height: clamp(50px, 35vw, 100px);
          overflow: hidden;
          /* background: #ffffff; */
        }
        .menu-hero-title {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-display);
          font-size: 24px;
          font-weight: 900;
          color: #000000;
          letter-spacing: 4px;
          /* text-shadow: 0 4px 20px rgba(0,0,0,0.5); */
          pointer-events: none;
        }

        .menu-panel {
          background-color: var(--bg);
          padding: clamp(24px, 4vw, 56px) clamp(18px, 5vw, 64px);
        }

        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 36px;
        }

        .menu-category { border-top: 2px solid var(--black); padding-top: 18px; }
        .menu-category h3 {
          font-family: var(--font-display);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 2.5px;
          text-transform: uppercase;
          margin-bottom: 18px;
        }

        .menu-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 9px 0;
          border-bottom: 1px dotted rgba(0,0,0,0.2);
          font-size: 14px;
          gap: 12px;
        }
        .menu-row:last-child { border-bottom: none; }
        .dish-name { flex: 1; }
        .dish-price { font-weight: 700; white-space: nowrap; }

        .container { max-width: 1100px; margin: 0 auto; }

        footer {
          text-align: center;
          padding: 30px;
          color: var(--gray);
          font-size: 0.9em;
          margin-top: 60px;
          border-top: 1px solid rgba(0,0,0,0.18);
          background: var(--bg);
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
          color: var(--gray);
        }
        .empty-state h2 {
          font-family: var(--font-display);
          font-size: 1.5em;
          margin-bottom: 10px;
        }

        @media (max-width: 480px) {
          .menu-grid { grid-template-columns: repeat(2, 1fr); gap: 18px; }
          .menu-row { font-size: 13px; }
        }
    </style>
</head>
<body>
    <div class="menu-hero">
      <div class="menu-hero-title">Menu</div>
    </div>

    <div class="menu-panel">
      <div class="container">
        <?php if (empty($categories)): ?>
            <div class="empty-state">
                <h2>Menu Coming Soon</h2>
                <p>We're preparing something delicious for you. Please check back later.</p>
            </div>
        <?php else: ?>
            <div class="menu-grid">
                <?php foreach ($categories as $categoryName => $items): ?>
                    <div class="menu-category">
                        <h3><?= htmlspecialchars($categoryName) ?></h3>
                        <?php foreach ($items as $item): ?>
                            <div class="menu-row">
                                <span class="dish-name"><?= htmlspecialchars($item['name']) ?></span>
                                <span class="dish-price">â‚¹<?= number_format($item['price'], 2) ?></span>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
      </div>
    </div>

    <footer>
        <p>&copy; <?= date('Y') ?> <?= htmlspecialchars($restaurantName) ?>. All rights reserved.</p>
    </footer>
</body>
</html>

