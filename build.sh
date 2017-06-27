#!/bin/sh
uglifyjs \
	src/jsmpeg.js \
	src/video-element.js \
	src/player.js \
	src/buffer.js \
	src/ajax.js \
	src/ajax-progressive.js \
	src/websocket.js \
	src/ts.js \
	src/decoder.js \
	src/mpeg1.js \
	src/mp2.js \
	src/webgl.js \
	src/canvas2d.js \
	src/webaudio.js \
	-o jsmpeg.min.js


THIS_DIR=`dirname $(readlink -f $0)`; cd $THIS_DIR

[ -f jquery-1.11.1.min.js ] || wget http://www.jqwidgets.com/jquery-widgets-demo/scripts/jquery-1.11.1.min.js
[ -f jqxcore.js ]   || wget http://www.jqwidgets.com/jquery-widgets-demo/jqwidgets/jqxcore.js
[ -f jqxslider.js ] || wget http://www.jqwidgets.com/jquery-widgets-demo/jqwidgets/jqxslider.js

