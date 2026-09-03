<?php
chdir('c:/xampp/htdocs/artists_farm');
require_once 'php/config/database.php';
require_once 'php/channex/webhook_receiver.php';

global $pdo;

$inputFile = $argv[1] ?? null;
if (!$inputFile || !file_exists($inputFile)) {
    echo json_encode(['status' => 'error', 'message' => 'Input file not found']);
    exit(1);
}

$payload = json_decode(file_get_contents($inputFile), true);
$receiver = new ChannexWebhookReceiver($pdo);
$res = $receiver->handleWebhook($payload);

echo json_encode($res);
