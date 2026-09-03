<?php
/**
 * Default Expense Categories & Items for MultiKey Properties
 * These are auto-populated when a new MultiKey property is created
 * System defaults are read-only; custom items can be added and edited
 */

$DEFAULT_EXPENSE_CATEGORIES = [
    [
        'name' => 'Staff Expenses',
        'items' => [
            'Manager salary',
            'Caretaker',
            'Housekeeping',
            'Cook salary',
            'Kitchen helper salary',
            'Gardener',
            'Security guard',
            'Maintenance staff',
            'Driver',
            'Laundry staff',
            'Temporary/event staff',
        ]
    ],
    [
        'name' => 'Staff Benefits',
        'items' => [
            'Staff uniforms',
            'Staff bonuses',
            'Staff accommodation',
        ]
    ],
    [
        'name' => 'Utilities',
        'items' => [
            'Electricity',
            'Water',
            'LPG/Gas cylinders',
            'Internet/Wi-Fi',
            'Mobile phone bills',
            'Cable/DTH',
            'Generator diesel',
            'Generator servicing',
            'Inverter maintenance',
            'Inverter batteries',
        ]
    ],
    [
        'name' => 'Guest Amenities',
        'items' => [
            'Shampoo',
            'Conditioner',
            'Body wash',
            'Soap',
            'Toothbrush',
            'Toothpaste',
            'Shaving kit',
            'Comb',
            'Shower cap',
            'Slippers',
            'Tissues',
            'Toilet paper',
            'Sanitary pads',
            'Handwash',
            'Moisturizer',
            'Air freshener',
        ]
    ],
    [
        'name' => 'Cleaning Supplies',
        'items' => [
            'Floor cleaner',
            'Toilet cleaner',
            'Glass cleaner',
            'Phenyl',
            'Bleach',
            'Detergent',
            'Dishwashing liquid',
            'Dishwasher tablets',
            'Garbage bags',
            'Sponges',
            'Scrubbers',
            'Cleaning cloths',
            'Mops',
            'Brooms',
            'Vacuum cleaner bags',
        ]
    ],
    [
        'name' => 'Laundry',
        'items' => [
            'Washing powder',
            'Fabric softener',
            'Bleach',
            'Laundry bags',
            'Ironing expenses',
            'Linen replacement',
        ]
    ],
    [
        'name' => 'Room Supplies',
        'items' => [
            'Bedsheets',
            'Pillow covers',
            'Blankets',
            'Quilts',
            'Mattress protectors',
            'Towels',
            'Bath mats',
            'Curtains',
            'Pillows',
            'Mattresses',
            'Hangers',
        ]
    ],
    [
        'name' => 'Furniture & Décor',
        'items' => [
            'Sofa',
            'Chairs',
            'Dining table',
            'Coffee table',
            'Side tables',
            'Wardrobes',
            'Lamps',
            'Paintings',
            'Flower pots',
            'Decorative items',
            'Carpets',
            'Mirrors',
            'Cushions',
        ]
    ],
    [
        'name' => 'Appliances',
        'items' => [
            'Refrigerator',
            'Microwave',
            'Oven',
            'Induction cooktop',
            'Gas stove',
            'Dishwasher',
            'Washing machine',
            'Dryer',
            'Water purifier',
            'Geyser',
            'Air conditioner',
            'Ceiling fan',
            'Television',
            'Sound system',
            'Hair dryer',
            'Iron',
            'Electric kettle',
            'Toaster',
            'Mixer grinder',
        ]
    ],
    [
        'name' => 'Maintenance & Repairs',
        'items' => [
            'Plumbing',
            'Electrical repairs',
            'Carpenter',
            'Painter',
            'Mason',
            'AC servicing',
            'Refrigerator repair',
            'Dishwasher repair',
            'Washing machine repair',
            'Pest control',
            'Water tank cleaning',
            'Borewell maintenance',
            'Swimming pool maintenance',
            'Garden maintenance',
            'Lock repairs',
            'Roof repairs',
            'Waterproofing',
        ]
    ],
    [
        'name' => 'Garden & Outdoor',
        'items' => [
            'Plants',
            'Fertilizer',
            'Seeds',
            'Garden tools',
            'Lawn mower servicing',
            'Outdoor furniture',
            'Umbrellas',
            'Outdoor lighting',
            'Irrigation system',
            'Garden hoses',
        ]
    ],
    [
        'name' => 'Swimming Pool',
        'items' => [
            'Chlorine',
            'Pool chemicals',
            'Pool cleaning',
            'Pump repairs',
            'Pool filter replacement',
            'Water top-up',
        ]
    ],
    [
        'name' => 'Office Expenses',
        'items' => [
            'Printer paper',
            'Printer ink',
            'Pens',
            'Registers',
            'Files',
            'Computer accessories',
            'External hard drive',
            'Printer maintenance',
        ]
    ],
    [
        'name' => 'Technology',
        'items' => [
            'Website hosting',
            'Domain renewal',
            'PMS software',
            'Channel manager',
            'CCTV maintenance',
            'CCTV storage',
            'Smart locks',
            'POS software',
            'Cloud backup',
            'Email services',
        ]
    ],
    [
        'name' => 'Booking & Marketing',
        'items' => [
            'Airbnb commission',
            'Booking platform commissions',
            'Google Ads',
            'Facebook Ads',
            'Instagram Ads',
            'Photography',
            'Website maintenance',
            'Promotional offers',
            'Graphic design',
        ]
    ],
    [
        'name' => 'Transportation',
        'items' => [
            'Fuel',
            'Vehicle servicing',
            'Vehicle insurance',
            'Parking',
            'Driver expenses',
            'Toll charges',
        ]
    ],
    [
        'name' => 'Taxes & Licenses',
        'items' => [
            'GST',
            'Property tax',
            'Water tax',
            'Trade licence',
            'Fire safety renewal',
            'Pollution certificate',
            'Professional fees',
            'CA fees',
            'Legal fees',
        ]
    ],
    [
        'name' => 'Insurance',
        'items' => [
            'Property insurance',
            'Fire insurance',
            'Public liability insurance',
            'Equipment insurance',
        ]
    ],
    [
        'name' => 'Guest Entertainment',
        'items' => [
            'Board games',
            'Books',
            'Streaming subscriptions',
            'Music subscriptions',
            'Outdoor games',
            'Badminton equipment',
            'Cricket equipment',
            'Bonfire wood',
            'Bluetooth speaker',
        ]
    ],
    [
        'name' => 'Miscellaneous',
        'items' => [
            'Flowers',
            'Candles',
            'Mosquito repellents',
            'Batteries',
            'Extension cords',
            'Light bulbs',
            'Emergency purchases',
            'Courier charges',
            'Bank charges',
            'Payment gateway charges',
            'Packaging materials',
            'First aid supplies',
        ]
    ],
    [
        'name' => 'Capital Assets',
        'items' => [
            'New furniture',
            'Air conditioners',
            'Refrigerator',
            'Dishwasher',
            'Solar panels',
            'Water tank',
            'Generator',
            'Inverter',
            'CCTV system',
            'Kitchen equipment',
            'Mattresses',
            'Renovation',
            'Construction',
            'Borewell',
            'Water pumps',
        ]
    ],
];

/**
 * Populate default expenses for a property
 * @param PDO $pdo Database connection
 * @param int $propertyId Property ID
 * @param bool $forceRefresh If true, re-populate defaults even if they exist
 */
function populateDefaultExpenses($pdo, $propertyId, $forceRefresh = false) {
    global $DEFAULT_EXPENSE_CATEGORIES;

    try {
        // Ensure table exists with is_system_default column. Guarded with the
        // same isSchemaVerified()/markSchemaVerified() hourly-TTL cache every
        // other schema self-heal in this codebase uses (schema_cache.php) -
        // added 3 Sep 2026 after a real live failure: this CREATE TABLE ran
        // completely unconditionally on every single call, and CREATE/ALTER
        // TABLE implicitly commits any open transaction in MySQL - calling
        // this (via createMultiKeyPropertyCore(), during the new-tenant
        // onboarding audit's fix) from inside registerTenantTrial()'s own
        // beginTransaction()/commit() wrapper silently ended that transaction
        // partway through, so the function's own later commit() failed with
        // "There is no active transaction" and the whole signup 500'd - a
        // real, live regression, not a hypothetical. Skipping the DDL once
        // the table is known to exist fixes it for every caller, not just
        // this new one.
        if (!function_exists('isSchemaVerified')) {
            require_once __DIR__ . '/../config/schema_cache.php';
        }
        if (!isSchemaVerified('schema_miscellaneous_catalog')) {
            $pdo->exec("CREATE TABLE IF NOT EXISTS `miscellaneous_catalog` (
                `id` INT AUTO_INCREMENT PRIMARY KEY,
                `property_id` INT NOT NULL,
                `label` VARCHAR(255) NOT NULL,
                `default_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
                `category` VARCHAR(100) NOT NULL,
                `description` TEXT,
                `is_system_default` BOOLEAN DEFAULT FALSE,
                `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY `unique_item_per_property` (property_id, label)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
            markSchemaVerified('schema_miscellaneous_catalog');
        }

        // Check if defaults already exist for this property
        $stmt = $pdo->prepare("SELECT COUNT(*) as cnt FROM miscellaneous_catalog WHERE property_id = ? AND is_system_default = TRUE");
        $stmt->execute([$propertyId]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        $defaultsExist = $result['cnt'] > 0;

        if ($forceRefresh && $defaultsExist) {
            // Delete existing defaults
            $pdo->prepare("DELETE FROM miscellaneous_catalog WHERE property_id = ? AND is_system_default = TRUE")->execute([$propertyId]);
        }

        if (!$defaultsExist || $forceRefresh) {
            // Insert all default items
            $insertStmt = $pdo->prepare(
                "INSERT IGNORE INTO miscellaneous_catalog (property_id, label, category, is_system_default, default_amount)
                VALUES (?, ?, ?, TRUE, 0.00)"
            );

            foreach ($DEFAULT_EXPENSE_CATEGORIES as $categoryGroup) {
                $categoryName = $categoryGroup['name'];
                foreach ($categoryGroup['items'] as $itemName) {
                    $insertStmt->execute([$propertyId, $itemName, $categoryName]);
                }
            }

            return ['status' => 'success', 'message' => 'Default expenses populated'];
        } else {
            return ['status' => 'success', 'message' => 'Defaults already exist for this property'];
        }
    } catch (Exception $e) {
        return ['status' => 'error', 'message' => $e->getMessage()];
    }
}
