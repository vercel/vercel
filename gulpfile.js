const gulp = require('gulp');
const del = require('del');
const ext = require('gulp-ext');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const help = require('gulp-task-listing');

gulp.task('help', help);

gulp.task('compile', [
  'compile-lib',
  'compile-bin'
]);

gulp.task('compile-lib', () => {
  return gulp.src('lib/**/*.js')
  .pipe(babel({
    presets: ['es2015'],
    plugins: [
      'syntax-async-functions',
      'transform-async-to-generator',
      'transform-runtime'
    ]
  }))
  .pipe(uglify())
  .pipe(gulp.dest('build/lib'));
});

gulp.task('compile-bin', () => {
  return gulp.src('bin/*')
  .pipe(babel({
    presets: ['es2015'],
    plugins: [
      'syntax-async-functions',
      'transform-async-to-generator',
      'transform-runtime'
    ]
  }))
  .pipe(uglify())
  .pipe(ext.crop())
  .pipe(gulp.dest('build/bin'));
});

gulp.task('watch', ['watch-lib', 'watch-bin']);

gulp.task('watch-lib', () => {
  return gulp.watch('lib/*.js', ['compile-lib']);
});

gulp.task('watch-bin', () => {
  return gulp.watch('bin/*', ['compile-bin']);
});

gulp.task('clean', () => {
  return del(['build']);
});

gulp.task('default', ['compile', 'watch']);
