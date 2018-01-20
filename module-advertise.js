
const resolve = require('path').resolve;
const dir = require('node-dir');
const {JpegsFromMp4File} = require('./module-common.js');

module.exports = class AdvertiseBox
{
	constructor( config, feedCallback ) 
	{
		this.config = config;
		this.feedCallback = feedCallback;
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

		this.getNewPlaylist( [], this.nowOrder);
	}

	start( cmdObj, callback )
	{
		this.active = true;
		cmdObj = cmdObj || this.defaultCmdObj;

		if (cmdObj.internalCall !== true) {
			this.file2Play.length = 0;
			this.source && this.source.stop();
		}

		if (this.file2Play.length === 0) {
			this.getNewPlaylist( cmdObj.disableList, cmdObj.order, (list)=>{
				this.file2Play = list;
				setImmediate( ()=>{
					cmdObj.internalCall = true;
					this.active && this.start( cmdObj );
				});
			});

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

			setImmediate( ()=>{
				this.active && this.start( cmdObj );
			});
			return;
		} while(false);

		console.log('advertise: ', mp4File);
		this.source = new JpegsFromMp4File( this.config,mp4File,this.feedProxy.bind(this), ()=>{
			setImmediate( ()=>{
				cmdObj.internalCall = true;
				this.active && this.start( cmdObj );
			});
		}).start( callback );
	}

	getNewPlaylist( disableList, order, callback ) 
	{
		this.updateOnlineList( this.config.src, order, (onlineList)=>{
			let newList = [];
			for (var path in onlineList) {
				if (disableList.indexOf(path) === -1) {
					newList = newList.concat( onlineList[path] );
				}
			}
			this.reOrderArray( newList, order );
			callback && callback( newList );
		});
	}

	updateOnlineList( mp4Paths, order, callback ) 
	{
		let reOrderArray = this.reOrderArray;
		let pathKeys = [];
		let counter = 0;
		mp4Paths.forEach(( mp4Path)=> {
			pathKeys.push( resolve( mp4Path ));
			counter++;
			dir.subdirs(mp4Path, (err, subdirs)=> {
				counter--;
				if (err) {
					console.log('updateOnlineList error', err);
					return;
				}
				subdirs.forEach( (path)=>{
					pathKeys.push( resolve(path) );
				});	

				if (counter === 0) {
					this.onlineList = getPathsFiles( pathKeys );
					callback( this.onlineList );
				}
			});
		});

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
		this.active && this.feedCallback( jpeg );
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
