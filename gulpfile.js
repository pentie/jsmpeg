'use strict';

var gulp = require('gulp'),
  concat = require('gulp-concat'),
  sourcemaps = require('gulp-sourcemaps'),
  rename = require('gulp-rename'),
  insert = require('gulp-insert'),
  uglify = require('gulp-uglify');

gulp.task('default', function() {
  return gulp.src([ "src/jsmpeg.js", 
        "src/video-element.js",
        "src/player.js",
        "src/buffer.js",
        "src/ajax.js",
        "src/ajax-progressive.js",
        "src/websocket.js",
        "src/source-disp.js",
        "src/ts.js",
        "src/decoder.js",
        "src/json-event.js",
        "src/mjpeg.js",
        "src/mpeg1.js",
        "src/mp2.js",
        "src/webgl.js",
        "src/canvas2d.js",
        "src/webaudio.js",
        "src/crc.js"])
    // This will output the non-minified version
    .pipe(sourcemaps.init())
    .pipe(concat('jsmpeg.js'))
    .pipe(gulp.dest('public'))
    // This will minify and rename to foo.min.js",
    .pipe(uglify())
    // .pipe(insert.prepend('/*! build time: ' + (new Date()).toLocaleString() + ' */\n'))
    .pipe(rename({ extname: '.min.js' }))
    .pipe(sourcemaps.write('./'))
    .pipe(gulp.dest('public'));
});

