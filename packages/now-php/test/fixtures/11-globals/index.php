<?php
header('Content-Type: text/plain');
print($_SERVER['SCRIPT_FILENAME'] . PHP_EOL);
print($_SERVER['REQUEST_URI'] . PHP_EOL);
print($_SERVER['HTTP_HOST'] . PHP_EOL);
print($_SERVER['SERVER_NAME'] . PHP_EOL);
print($_SERVER['SERVER_PORT'] . PHP_EOL);
print($_SERVER['HTTPS'] . PHP_EOL);
print($_GET['paramA'] . PHP_EOL);
var_dump($_GET['paramB']);
print($_GET['paramC'] . PHP_EOL);
