<?php
chdir('c:/xampp/htdocs/artists_farm');
require 'php/config/database.php';

$props = $pdo->query("SELECT id, name, slug FROM properties")->fetchAll(PDO::FETCH_ASSOC);
print_r($props);

$guests = $pdo->query("SELECT id, property_id, name, room_id, check_in, check_out, status FROM guests ORDER BY id DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
print_r($guests);
