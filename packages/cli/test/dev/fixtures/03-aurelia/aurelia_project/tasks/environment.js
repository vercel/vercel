import project from '../aurelia.json';
import rename from 'gulp-rename';
import gulp from 'gulp';
import fs from 'fs';
import through from 'through2';
import {CLIOptions} from 'aurelia-cli';

function configureEnvironment() {
  let env = CLIOptions.getEnvironment();

  return gulp.src(`aurelia_project/environments/${env}${project.transpiler.fileExtension}`)
    .pipe(rename(`environment${project.transpiler.fileExtension}`))
    .pipe(through.obj(function (file, _, cb) {
      // https://github.com/aurelia/cli/issues/1031
      fs.unlink(`${project.paths.root}/${file.relative}`, function () { cb(null, file); });
    }))
    .pipe(gulp.dest(project.paths.root))
    .pipe(through.obj(function(file, enc, cb) {
      // https://github.com/webpack/watchpack/issues/25#issuecomment-287789288
      const now = Date.now() / 1000;
      const then = now - 10;
      fs.utimes(file.path, then, then, function(err) { if (err) throw err; });
      cb(null, file);
    }));
}

export default configureEnvironment;
