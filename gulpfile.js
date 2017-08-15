// Packages
const gulp = require('gulp')
const babel = require('gulp-babel')

// Where the source code lives
const path = './src/**/*.js'

gulp.task('default', () => {
  return gulp.src(path)
  .pipe(babel({
    presets: ['flow']
  }))
  .pipe(gulp.dest('./dist'))
})

gulp.task('watch', () => {
  gulp.watch(path, ['default'])
})
