#!/bin/sh

# npm install uglify-js -g

uglifyjs \
	src/jsmpeg.js \
	src/video-element.js \
	src/player.js \
	src/buffer.js \
	src/ajax.js \
	src/ajax-progressive.js \
	src/websocket.js \
	src/source-disp.js \
	src/ts.js \
	src/decoder.js \
	src/json-event.js \
	src/mjpeg.js \
	src/mpeg1.js \
	src/mp2.js \
	src/webgl.js \
	src/canvas2d.js \
	src/webaudio.js \
	src/crc.js \
	-o public/jsmpeg.min.js

