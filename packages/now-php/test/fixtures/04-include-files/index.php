<?php

echo 'mainfile:';
if (file_exists('included_file.php') && !file_exists('excluded_file.php')) {
  require_once 'included_file.php';
} else {
  echo PHP_EOL;
  print_r(array_diff(scandir('.'), array('..', '.')));
}
