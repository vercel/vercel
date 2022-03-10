get_program_path() {
  which $1 || echo 'not found'
}

mkdir public
get_program_path 'jekyll' > public/jekyll.txt
get_program_path 'middelman' > public/middleman.txt
get_program_path 'dimples' > public/dimples.txt
