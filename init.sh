#!/bin/bash

THIS_DIR=`dirname $(readlink -f $0)`

main() 
{
	check_update
	check_apt mplayer

	if [ "$1" = "client" ]; then
		build_mjpg_streamer

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
	fi

	if ! cmd_exists /usr/bin/node; then
		log "installing nodejs"
		curl -sL https://deb.nodesource.com/setup_7.x | sudo -E bash -
		check_apt nodejs
	fi

	if ! cmd_exists /usr/bin/uglifyjs; then
		npm install uglify-js -g
	fi

	cd $THIS_DIR

	npm install

	if ! cmd_exists ffmpeg; then 
		echo "you must manual install ffmpeg, don't forget gpu support"
		exit 1
	fi

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

main "$@"; exit $?
