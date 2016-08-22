import gulp from 'gulp';
import del from 'del';
import babel from 'gulp-babel';
import help from 'gulp-task-listing';
import { exec as enclose } from 'enclose';

gulp.task('help', help);

gulp.task('compile', [
  'compile-lib',
  'compile-bin'
]);

gulp.task('compile-lib', () =>
  gulp.src('lib/**/*.js')
  .pipe(babel())
  .pipe(gulp.dest('build/lib')));

gulp.task('compile-bin', () =>
  gulp.src('bin/*')
  .pipe(babel())
  .pipe(gulp.dest('build/bin')));

gulp.task('enclose', ['compile'], (cb) => {
  enclose([
    'build/bin/now',
    '-c', 'enclose.js',
    '-o', 'build/now'
  ], cb);
});

gulp.task('watch-lib', () => gulp.watch('lib/**/*.js', ['compile-lib']));
gulp.task('watch-bin', () => gulp.watch('bin/*', ['compile-bin']));
gulp.task('clean', () => del(['build']));

gulp.task('watch', ['watch-lib', 'watch-bin']);
gulp.task('default', ['compile', 'watch']);
