import gulp from 'gulp';
import del from 'del';
import babel from 'gulp-babel';
import uglify from 'gulp-uglify';
import help from 'gulp-task-listing';

gulp.task('help', help);

gulp.task('compile', [
  'compile-lib',
  'compile-bin'
]);

gulp.task('compile-lib', () =>
  gulp.src('lib/**/*.js')
  .pipe(babel())
  .pipe(uglify())
  .pipe(gulp.dest('build/lib')));

gulp.task('compile-bin', () =>
  gulp.src('bin/*')
  .pipe(babel())
  .pipe(uglify())
  .pipe(gulp.dest('build/bin')));

gulp.task('watch-lib', () => gulp.watch('lib/*.js', ['compile-lib']));
gulp.task('watch-bin', () => gulp.watch('bin/*', ['compile-bin']));
gulp.task('clean', () => del(['build']));

gulp.task('watch', ['watch-lib', 'watch-bin']);
gulp.task('default', ['compile', 'watch']);
