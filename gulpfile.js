/* jshint esversion: 6, asi: true */

let { curlVersion, opensslVersion, zlibVersion } = require('./package.json')
let TOOLCHAIN_PATH = require('nodeos-cross-toolchain')

let del         = require('del')
let log         = require('gulplog')
let gulp        = require('gulp')
let exit        = require('exit')
let shell       = require('gulp-shell')
let uname       = require('node-uname')
let source      = require('shell-source')
let download    = require('gulp-downloader')
let decompress  = require('gulp-decompress')
let environment = require('gulp-env')
let chalk       = require('chalk')

/**
 * @author jaredhanson
 * @param  {Object} parent The parent object that gets the child merged in
 * @param  {Object} child  The child object which gets merged into the parent
 * @return {Object}        Returns a merged object
 */
let mergeObj = (parent, child) => {
    if (parent && child) {
        for (var key in child) {
          parent[key] = child[key];
        }
      }
    return parent;
}

/**
 * Gets the correct node platform with uname
 * @return {String} Returns the node platform
 */
let platform = () => {
    let nodePlatform = uname().sysname
    switch (nodePlatform) {
        case 'Linux':
            nodePlatform = 'linux' 
            break;
        case 'FreeBSD':
            nodePlatform = 'freebsd' 
            break;
        case 'WindowsNT':
            nodePlatform = 'win' 
            break;
        case 'Darwin':
            nodePlatform = 'darwin' 
            break;
        case 'SunOS':
            nodePlatform = 'solaris' 
            break;
        case 'AIX':
            nodePlatform = 'linux' 
            break;
        default:
            log.error('Unknown OS', nodePlatform)
            exit(1)
            break;
    }

    return nodePlatform
}

//paths for the build
let paths = {}
let buildEnv = () => { 
    source(`${TOOLCHAIN_PATH}/scripts/adjustEnvVars.sh`, { source: false }, (err, env) => {
        if (err) {
            log.error(err)
            return exit(0)
        }

        paths = {
            CURL_SRC_DIR: 'deps/curl',
            OPENSSL_SRC_DIR: 'deps/openssl',
            ZLIB_SRC_DIR: 'deps/zlib',

            OBJ_DIR: `build/${env.CPU}`,
            OUT_DIR: `out/${env.CPU}`
        }

        return environment.set(env)
    })
}

buildEnv()

// clean up some dirs
gulp.task('clean', () => {
    log.debug('Remove build/ deps/ out/')
    return del([ 'build/', 'deps/', 'out/' ])
})

// download curl
gulp.task('download-curl', () => {
    log.debug('download curl')
    return download(`https://curl.haxx.se/download/curl-${curlVersion}.tar.gz`)
        .pipe(decompress({ strip: 1 }))
        .pipe(gulp.dest('deps/curl'))
})

// download openssl
gulp.task('download-openssl', () => {
    log.debug('download openssl')
    return download(`https://www.openssl.org/source/openssl-${opensslVersion}.tar.gz`)
        .pipe(decompress({ strip: 1 }))
        .pipe(gulp.dest('deps/openssl'))
})

// download zlib
gulp.task('download-zlib', () => {
    log.debug('download zlib')
    return download(`https://www.zlib.net/zlib-${zlibVersion}.tar.gz`)
        .pipe(decompress({ strip: 1 }))
        .pipe(gulp.dest('deps/zlib'))
})

// download all the things
gulp.task('download', gulp.parallel('download-openssl', 'download-zlib', 'download-curl'))

// prepare curl
gulp.task('prepare-curl', () => {
    log.debug('prepare curl environment')
    let curlEnv = environment.set({
        CROSS_COMPILE:  process.env.TARGET,
        CC:             `${process.env.TARGET}-gcc`,
        AR:             `${process.env.TARGET}-ar`,
        AS:             `${process.env.TARGET}-as`,
        LD:             `${process.env.TARGET}-ld`,
        NM:             `${process.env.TARGET}-nm`,
        PATH:           `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`,
        RANLIB:         `${process.env.TARGET}-ranlib`,
        CPPFLAGS:       `-I${process.env.PWD}/${paths.OUT_DIR}/openssl/include -I${process.env.PWD}/${paths.OUT_DIR}/zlib/include -I${TOOLCHAIN_PATH}/${process.env.TARGET}/include`,
        LDFLAGS:        `-L${process.env.PWD}/${paths.OUT_DIR}/openssl/lib/libssl.a -L${process.env.PWD}/${paths.OUT_DIR}/zlib/lib/libz.a`
    })

    let args = [
        `--host=${process.env.HOST}`,
        `--target=${process.env.TARGET}`,
        `--prefix=${process.env.PWD}/${paths.OUT_DIR}/curl`,
        '--with-random=/dev/urandom',
        '--disable-manual',
        '--disable-shared',
        '--enable-static',
        '--disable-verbose',
        '--disable-ipv6',
        '--with-ssl',
        '--with-zlib',
        '--silent'
    ]

    return gulp.src(`${process.env.PWD}/${paths.CURL_SRC_DIR}/configure`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.CURL_SRC_DIR} && ./configure ${args.join(' ')}`))
               .pipe(curlEnv.reset)
})

// prepare openssl
gulp.task('prepare-openssl', () => {
    log.debug('prepare openssl environment')
    let opensslEnv = environment.set({
        CROSS:      process.env.TARGET,
        TARGETMACH: process.env.TARGET,
        BUILDMACH:  process.env.HOST,
        CC:         `${process.env.TARGET}-gcc`,
        AR:         `${process.env.TARGET}-ar`,
        AS:         `${process.env.TARGET}-as`,
        LD:         `${process.env.TARGET}-ld`,
        NM:         `${process.env.TARGET}-nm`,
        PATH:       `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`,
        RANLIB:     `${process.env.TARGET}-ranlib`,
        CPPFLAGS:   `-I${TOOLCHAIN_PATH}/${process.env.TARGET}/include`
    })

    let args = [
        `--openssldir=${process.env.PWD}/${paths.OUT_DIR}/openssl`,
        `--prefix=${process.env.PWD}/${paths.OUT_DIR}/openssl`,
        `os/compiler:${process.env.HOST}-`, // host triplet
    ]

    return gulp.src(`${process.env.PWD}/${paths.OPENSSL_SRC_DIR}/Configure`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.OPENSSL_SRC_DIR} && ./Configure ${args.join(' ')}`))
               .pipe(opensslEnv.reset)
})
// prepare zlib
gulp.task('prepare-zlib', () => {
    log.debug('prepare zlib environment')
    let zlibEnv = environment.set({
        PATH:       `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`,
        CROSS:      process.env.TARGET,
        BUILDMACH:  process.env.HOST,
        TARGETMACH: process.env.TARGET,
        AR:         `${process.env.TARGET}-ar`,
        AS:         `${process.env.TARGET}-as`,
        LD:         `${process.env.TARGET}-ld`,
        CC:         `${process.env.TARGET}-gcc`,
        NM:         `${process.env.TARGET}-nm`,
        RANLIB:     `${process.env.TARGET}-ranlib`
    })

    let args = [
        `--prefix=${process.env.PWD}/${paths.OUT_DIR}/zlib`,
        '--static'
    ]

    return gulp.src(`${process.env.PWD}/${paths.ZLIB_SRC_DIR}/configure`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.ZLIB_SRC_DIR} && ./configure ${args.join(' ')}`))
               .pipe(zlibEnv.reset)
})
// prepare all the things
gulp.task('prepare', gulp.series('prepare-openssl', 'prepare-zlib', 'prepare-curl'))


gulp.task('toolchain', shell.task(`cd ${TOOLCHAIN_PATH} && BITS=${process.env.BITS} CPU=${process.env.CPU} MACHINE=${process.env.MACHINE} npm install --production && cd ${process.env.PWD}`))

/**
 * Configure step for cross compile
 */
gulp.task('configure', gulp.series('clean', 'toolchain', 'download', 'prepare'))

gulp.task('build-zlib', () => {
    log.debug('build zlib')
    let buildZlibEnv = environment.set({
        PATH: `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`
    })

    let args = [
        `-j${process.env.JOBS}`
    ]

    return gulp.src(`${process.env.PWD}/${paths.ZLIB_SRC_DIR}`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.ZLIB_SRC_DIR} && make ${args.join(' ')}`))
               .pipe(shell(`cd ${process.env.PWD}/${paths.ZLIB_SRC_DIR} && make install ${args.join(' ')}`))
               .pipe(buildZlibEnv.reset)
})

gulp.task('build-openssl', () => {
    log.debug('build openssl')
    let buildOpensslEnv = environment.set({
        PATH: `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`
    })

    let args = [
        `-j${process.env.JOBS}`
    ]

    return gulp.src(`${process.env.PWD}/${paths.OPENSSL_SRC_DIR}`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.OPENSSL_SRC_DIR} && make ${args.join(' ')}`))
               .pipe(shell(`cd ${process.env.PWD}/${paths.OPENSSL_SRC_DIR} && make install ${args.join(' ')}`))
               .pipe(buildOpensslEnv.reset)
})

gulp.task('build-curl', () => {
    log.debug('build curl')
    let buildCurlEnv = environment.set({
        PATH: `${TOOLCHAIN_PATH}/bin:${process.env.PATH}`
    })

    let args = [
        `-j${process.env.JOBS}`
    ]

    return gulp.src(`${process.env.PWD}/${paths.CURL_SRC_DIR}`)
               .pipe(shell(`cd ${process.env.PWD}/${paths.CURL_SRC_DIR} && make ${args.join(' ')}`))
               .pipe(shell(`cd ${process.env.PWD}/${paths.CURL_SRC_DIR} && make install ${args.join(' ')}`))
               .pipe(buildCurlEnv.reset)
})

/**
 * Build the module
 */
gulp.task('build', gulp.series('build-zlib', 'build-openssl', 'build-curl'))

/**
 * Generate prebuilds for the module
 */
gulp.task('prebuilt', () => {
    
})

/**
 * All in one task
 */
gulp.task('default', gulp.series('configure', 'build'))