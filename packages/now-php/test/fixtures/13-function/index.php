<?php

// regression test for go-php engine reusage. on failure prints
// Fatal error: Cannot redeclare some_function() (previously declared in /var/task/user/index.php:7)

function some_function() {
  print("paskantamasaari");
}

some_function();
