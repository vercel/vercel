<?php
header('Content-Type: text/plain');
print($_SERVER['SCRIPT_FILENAME'] . PHP_EOL);
print($_SERVER['REQUEST_METHOD'] . PHP_EOL);
print($_SERVER['REQUEST_URI'] . PHP_EOL);
print($_SERVER['HTTP_HOST'] . PHP_EOL);
print($_SERVER['HTTP_X_SOME_HEADER'] . PHP_EOL);
print($_SERVER['SERVER_PROTOCOL'] . PHP_EOL);
print($_SERVER['SERVER_NAME'] . PHP_EOL);
print($_SERVER['SERVER_PORT'] . PHP_EOL);
print($_SERVER['HTTPS'] . PHP_EOL);

print($_GET['get1'] . PHP_EOL);
var_dump($_GET['get2']);
print($_POST['post1'] . PHP_EOL);
var_dump($_POST['post2']);
print($_COOKIE['cookie1'] . PHP_EOL);
var_dump($_COOKIE['cookie2']);

print($_REQUEST['get1'] . PHP_EOL);
var_dump($_REQUEST['get2']);
print($_REQUEST['post1'] . PHP_EOL);
var_dump($_REQUEST['post2']);
print($_REQUEST['cookie1'] . PHP_EOL);
var_dump($_REQUEST['cookie2']);

print(file_get_contents('php://input') . PHP_EOL);
print('end' . PHP_EOL);
