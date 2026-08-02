<?php
/**
 * Frontend Build Script
 * Runs: npm install && npm run build
 */

$output = "=== Building Frontend ===\n\n";

// Change to project directory
$project_dir = '/home/apartment/public_html';
$output .= "Project dir: $project_dir\n\n";

// Run npm install
$output .= "Running: npm install\n";
$result = shell_exec("cd $project_dir && npm install 2>&1");
$output .= $result . "\n";

// Run npm build
$output .= "Running: npm run build\n";
$result = shell_exec("cd $project_dir && npm run build 2>&1");
$output .= $result . "\n";

// Check if dist folder exists
$output .= "Checking build output...\n";
if (is_dir("$project_dir/dist")) {
    $output .= "✅ Build successful! dist/ folder created\n";
} else {
    $output .= "⚠️  No dist/ folder found - check errors above\n";
}

echo $output;
?>
