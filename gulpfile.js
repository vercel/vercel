const gulp = require('gulp');
const del = require('del');
const ext = require('gulp-ext');
const babel = require('gulp-babel');
const eslint = require('gulp-eslint');
const help = require('gulp-task-listing');

gulp.task('help', help);

gulp.task('compile', [
  'compile-lib',
  'compile-bin',
  'compile-scripts'
]);

gulp.task('compile-lib', function () {
  return gulp.src('lib/**/*.js')
  .pipe(babel({
    presets: ['es2015'],
    plugins: [
      'syntax-async-functions',
      'transform-async-to-generator',
      'transform-runtime'
    ]
  }))
  .pipe(gulp.dest('build/lib'));
});

gulp.task('compile-bin', function () {
  return gulp.src('bin/*')
  .pipe(babel({
    presets: ['es2015'],
    plugins: [
      'syntax-async-functions',
      'transform-async-to-generator',
      'transform-runtime'
    ]
  }))
  .pipe(ext.crop())
  .pipe(gulp.dest('build/bin'));
});

gulp.task('compile-scripts', function () {
  return gulp.src('scripts/*')
  .pipe(babel({
    presets: ['es2015'],
    plugins: [
      'syntax-async-functions',
      'transform-async-to-generator',
      'transform-runtime'
    ]
  }))
  .pipe(ext.crop())
  .pipe(gulp.dest('build/scripts'));
});

gulp.task('lint', function () {
  return gulp.src([
    'gulpfile.js',
    'lib/**/*.js',
    'bin/*'
  ])
  .pipe(eslint())
  .pipe(eslint.format())
  .pipe(eslint.failAfterError());
});

gulp.task('clean', function () {
  return del(['build']);
});

gulp.task('default', ['lint', 'compile']);
