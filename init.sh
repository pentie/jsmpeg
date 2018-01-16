#!/bin/bash

THIS_DIR=`dirname $(readlink -f $0)`

main() 
{
	check_apt mplayer ffmpeg libudev-dev v4l-utils alsa-utils

	if ! cmd_exists /usr/bin/node; then
		log "installing nodejs"
		curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
		check_apt nodejs
	fi

	if ! cmd_exists /usr/bin/npm; then
		log "installing npm"
		check_apt npm
	fi

	cd $THIS_DIR

	npm install
}

maintain()
{
	check_update
	[ "$1" = "update" ] && git_update_exit $2
	[ "$1" = "webcam" ] && mjpg_stream_exit $2
	[ "$1" = "buildjs" ] && buildjs_exit $2
}

buildjs_exit()
{
	if ! cmd_exists /usr/local/bin/uglifyjs; then
		npm install uglify-js -g
	fi

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

	exit 0
}

mjpg_stream_exit()
{
	build_mjpg_streamer

	if [ "$1" = 'kill' ]; then
		kill -9 $(pidof mjpg_streamer)
		log "mjpg_streamer was killed"
		exit 0
	fi

	if pidof mjpg_streamer >/dev/null; then
		log 'mjpg_streamer is running' 
	else
		local MJPG_WWW=/usr/local/share/mjpg-streamer/www
		local src_size='1024x768'
		export LD_LIBRARY_PATH=/usr/local/lib/mjpg-streamer

		mjpg_streamer -i "input_uvc.so -n -r ${src_size}" -o "output_http.so -p 8083 -w ${MJPG_WWW}" &

		log 'mjpg_streamer was started' 
	fi
	exit 0
}

check_git()
{
	local key="$1"
	local defautVal="$2"
	local value=$(git config --global --get ${key})

	if [ -z "$value" ]; then
		if [ -z $defautVal ]; then
			read -p "Please input git config of \"${key}\": " GIT_CONFIG_INPUT
		else
			GIT_CONFIG_INPUT=$defautVal
		fi

		if [ -z "$GIT_CONFIG_INPUT" ]; then
			echo "The input value is empty, exit"
			exit 1;
		fi
		git config --global --add ${key} ${GIT_CONFIG_INPUT}
	fi
}

git_update_exit()
{
	check_git user.name 
	check_git user.email
	check_git push.default simple
	check_git user.githubUserName 

	local push_url=$(git remote get-url --push origin)
	local githubUserName=$(git config --global --get user.githubUserName)

	if ! echo $push_url | grep -q "${githubUserName}@"; then
		local new_url=$(echo $push_url | sed -e "s/\/\//\/\/${githubUserName}@/g")
		git remote set-url origin $new_url
		echo "update remote url: $new_url"
	fi

	local input_msg=$1
	input_msg=${input_msg:="update"}

	cd $THIS_DIR
	git add .
	git commit -m "${input_msg}"
	git push

	exit 0
}

build_mjpg_streamer()
{
	if cmd_exists mjpg_streamer; then
		log 'mjpg_streamer has been installed'
		return 0
	fi

	check_apt cmake libjpeg8-dev

	cd $THIS_DIR && mkdir -p temp && cd temp

	if [ ! -d "mjpg-streamer" ]; then
		git clone https://github.com/jacksonliam/mjpg-streamer.git
	fi

	cd mjpg-streamer/mjpg-streamer-experimental
	make
	make install
}


#-------------------------------------------------------
#		basic functions
#-------------------------------------------------------

check_update()
{
	if [ $(whoami) != 'root' ]; then
	    echo "This script should be executed as root or with sudo:"
	    echo "	sudo $0"
	    exit 1
	fi

	local last_update=`stat -c %Y  /var/cache/apt/pkgcache.bin`
	local nowtime=`date +%s`
	local diff_time=$(($nowtime-$last_update))

	local repo_changed=0

	if [ $# -gt 0 ]; then
		for the_param in "$@"; do
			the_ppa=$(echo $the_param | sed 's/ppa:\(.*\)/\1/')

			if [ ! -z $the_ppa ]; then 
				if ! grep -q "^deb .*$the_ppa" /etc/apt/sources.list /etc/apt/sources.list.d/*; then
					add-apt-repository -y $the_param
					repo_changed=1
					break
				else
					log "repo ${the_ppa} has already exists"
				fi
			fi
		done
	fi 

	if [ $repo_changed -eq 1 ] || [ $diff_time -gt 604800 ]; then
		apt update -y
	fi

	if [ $diff_time -gt 6048000 ]; then
		apt upgrade -y
	fi 
}

check_apt()
{
	for package in "$@"; do
		if [ $(dpkg-query -W -f='${Status}' ${package} 2>/dev/null | grep -c "ok installed") -eq 0 ]; then
			apt install -y "$package"
		else
			log "${package} has been installed"
		fi
	done
}

log() 
{
	echo "$@"
	#logger -p user.notice -t install-scripts "$@"
}

cmd_exists() 
{
    type "$1" > /dev/null 2>&1
}

maintain "$@"; main "$@"; exit $?
