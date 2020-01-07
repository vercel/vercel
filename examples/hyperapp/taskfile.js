const browserSync = require('browser-sync');

let isWatching = false;

// some source/dest consts
const target = 'dist';
const releaseTarget = 'public';
const src = {
    js: 'src/**/*.js',
    scss: 'src/styles/app.scss',
    staticAssets: ['src/static/**/*.*', 'src/*.html'],
    vendor: [],
};

export async function clean(taskr) {
    await taskr.clear([target, releaseTarget]);
}

export async function copyStaticAssets(taskr, o) {
    await taskr.source(o.src || src.staticAssets).target(target);
}

export async function vendors(taskr) {
    await taskr
        .source(src.vendor)
        .concat('vendor.js')
        .target(`${target}`);
}

export async function js(taskr) {
    await taskr
        .source('src/app.js')
        .rollup({
            rollup: {
                plugins: [
                    require('rollup-plugin-buble')({ jsx: 'h' }),
                    require('rollup-plugin-commonjs')(),
                    require('rollup-plugin-replace')({
                        'process.env.NODE_ENV': JSON.stringify(
                            isWatching ? 'development' : 'production'
                        ),
                    }),
                    require('rollup-plugin-node-resolve')({
                        browser: true,
                        main: true,
                    }),
                ],
            },
            bundle: {
                format: 'iife',
                sourceMap: isWatching,
                moduleName: 'window',
            },
        })
        .target(`${target}`);
}

export async function styles(taskr) {
    await taskr
        .source(src.scss)
        .sass({
            outputStyle: 'compressed',
            includePaths: [],
        })
        .postcss({
            plugins: [
                require('autoprefixer')({ browsers: ['last 2 versions'] }),
            ],
        })
        .target(`${target}`);
}

export async function build(taskr) {
    // TODO add linting
    await taskr.serial([
        'clean',
        'copyStaticAssets',
        'styles',
        'js',
        'vendors',
    ]);
}

export async function release(taskr) {
    await taskr
        .source(`${target}/*.js`)
        .uglify({
            compress: {
                conditionals: 1,
                drop_console: 1,
                comparisons: 1,
                join_vars: 1,
                booleans: 1,
                loops: 1,
            },
        })
        .target(target);
    await taskr
        .source(`${target}/**/*`)
        .rev({
            ignores: ['.html', '.png', '.svg', '.ico', '.json', '.txt'],
        })
        .revManifest({ dest: releaseTarget, trim: target })
        .revReplace()
        .target(releaseTarget);
    await taskr
        .source(`${releaseTarget}/*.html`)
        .htmlmin()
        .target(releaseTarget);
    await taskr
        .source(`${releaseTarget}/**/*.{js,css,html,png,jpg,gif}`)
        .precache({ stripPrefix: `${releaseTarget}/` })
        .target(releaseTarget);
}

export async function watch(taskr) {
    isWatching = true;
    await taskr.start('build');
    await taskr.watch(src.js, ['js', 'reload']);
    await taskr.watch(src.scss, ['styles', 'reload']);
    await taskr.watch(src.staticAssets, ['copyStaticAssets', 'reload']);
    // start server
    browserSync({
        server: target,
        logPrefix: 'hyperapp',
        port: process.env.PORT || 4000,
        middleware: [require('connect-history-api-fallback')()],
    });
}

export async function reload(taskr) {
    isWatching && browserSync.reload();
}
