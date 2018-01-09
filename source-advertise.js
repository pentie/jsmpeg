
const resolve = require('path').resolve;
const dir = require('node-dir');
const {JpegsFromMp4File} = require('./common-modules.js');

module.exports = class AdvertiseSource
{
	constructor( env ) 
	{
		this.sourceName = 'advertise';
		this.feed = env.get('feed');
		this.config = env.get('configs').get('source.' + this.sourceName);
		this.size = this.config.size;
		this.active = false;
		this.onlineList = {};
		this.disableList = [];
		this.file2Play = []
		this.nowLoop = this.config.loop;
		this.nowOrder = this.config.order;
		this.defaultCmdObj = {
			disableList: [], 
			order: this.nowOrder,
			loop: this.nowLoop
		};

		if (this.config.autoStart === true) {
			this.start();
		} else {
			this.getNewPlaylist( [], this.nowOrder);
		}
	}

	list()
	{
		return {
			name: this.sourceName,
			active: this.active,
			caption: this.config.caption,
			loop: this.nowLoop,
			order: this.nowOrder,
			disableList: this.disableList,
			onlineList: this.onlineList
		}
	}

	start( cmdObj, callback )
	{
		if (cmdObj === undefined) {
			cmdObj = this.defaultCmdObj;
		}

		this.active = true;

		if (cmdObj.internalCall !== true) {
			this.file2Play.length = 0;
			this.source && this.source.stop();
		}

		if (this.file2Play.length === 0) {
			this.getNewPlaylist( cmdObj.disableList, cmdObj.order, function( list ){
				this.file2Play = list;
				setImmediate( function(){
					cmdObj.internalCall = true;
					this.active && this.start( cmdObj );
				}.bind(this));
			}.bind(this));

			this.disableList = cmdObj.disableList;
			this.nowLoop = cmdObj.loop;
			this.nowOrder = cmdObj.order;
			return;
		}

		let mp4File = this.file2Play.shift();
		do {
			if (mp4File) break;

			if (cmdObj.loop !== 'yes') {
				this.stop();
				return;
			}

			setImmediate( function(){
				this.active && this.start( cmdObj );
			}.bind(this));
			return;
		} while(false);

		console.log('playing: ', mp4File);
		this.source = new JpegsFromMp4File( this.config, mp4File, this.feedProxy.bind(this), function(){
			setImmediate( function(){
				cmdObj.internalCall = true;
				this.active && this.start( cmdObj );
			}.bind(this));
		}.bind(this)).start( callback );
	}

	getNewPlaylist( disableList, order, callback ) 
	{
		this.updateOnlineList( this.config.src, order, function(onlineList){
			let newList = [];
			for (var path in onlineList) {
				if (disableList.indexOf(path) === -1) {
					newList = newList.concat( onlineList[path] );
				}
			}
			this.reOrderArray( newList, order );
			callback && callback( newList );
		}.bind(this));
	}

	updateOnlineList( mp4Paths, order, callback ) 
	{
		let reOrderArray = this.reOrderArray;
		let pathKeys = [];
		let counter = 0;
		mp4Paths.forEach(function( mp4Path) {
			pathKeys.push( resolve( mp4Path ));
			counter++;
			dir.subdirs(mp4Path, function(err, subdirs) {
				counter--;
				if (err) {
					console.log('updateOnlineList error', err);
					return;
				}
				subdirs.forEach( function( path ){
					pathKeys.push( resolve(path) );
				});	

				if (counter === 0) {
					this.onlineList = getPathsFiles( pathKeys );
					callback( this.onlineList );
				}
			}.bind(this));
		}.bind(this));

		function getPathsFiles( paths ) {
			var newList = {};
			paths.forEach( function(path) {
				let subfiles = getFiles( path, order);
				if (subfiles.length) {
					newList[ path] = subfiles;
				}
			})
			return newList;
		}
		
		function getFiles( mp4Path, order ) 
		{
			let mp4Files = dir.files( mp4Path, {sync:true, recursive:false});

			mp4Files = mp4Files.filter(function(fileName) {
				return /mp4$/.test(fileName);
			});
			
			return reOrderArray( mp4Files, order );
		}
	}

	reOrderArray( list, order) 
	{
		function shuffleArray (array){
			for (var i = array.length - 1; i > 0; i--) {
				var rand = Math.floor(Math.random() * (i + 1));
				[array[i], array[rand]]=[array[rand], array[i]];
			}
		}

		switch (order) {
		    case 'asc': list.sort(); break;
		    case 'desc': list.reverse(); break;
		    case 'random': shuffleArray( list); break;
		    default: list.sort();
		}
		return list;
	}

	feedProxy( jpeg ) 
	{
		this.active && this.feed( jpeg );
	}

	pause ()
	{
		this.active = false;
	}

	resume ()
	{
		this.active = true;
	}

	stop ()
	{
		this.active = false;
		this.source && this.source.stop();
	}
};
