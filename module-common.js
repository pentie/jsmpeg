const resolve = require('path').resolve;
const fs = require('fs');
const dir = require('node-dir');
const path = require('path');
const { URL } = require('url');
const FileOnWrite = require('file-on-write');


function getMediaUrls( srcUrl )
{
	let mediaUrls = srcUrl.split('|').map(e=>e.trim()).filter(e=>e!='');

	if ( mediaUrls.length === 0 ) {
		return null;
	}

	let videoUrl = mediaUrls[0];
	let urlObj =  new URL( videoUrl );

	let result = {
		oriUrl: srcUrl,
		videoUrl: videoUrl,
		audioUrl: null,
		hostname: urlObj.hostname,
		port: parseInt(urlObj.port || '80')
	};

	if ( mediaUrls.length >= 2 ) {
	    let audioUrl = mediaUrls[1];
	    if (audioUrl.search(/^http:/) >= 0) {
		result.audioUrl = audioUrl;
	    } else {
		if (audioUrl.charAt(0) === '/' ) {
			urlObj.pathname = audioUrl;
		} else {
			let pathname = urlObj.pathname;
			let paths = pathname.split('/');
			paths.pop();
			paths.push(audioUrl);
			urlObj.pathname = paths.join('/');
		}
		result.audioUrl = urlObj.href;
	    }
	}

	return result;
}


function reOrderArray( list, order) 
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

function updateOnlineList( srcList, order, callback ) 
{
	let pathKeys = [];
	let counter = 0;
	srcList.forEach( mediaPath => {
		pathKeys.push( resolve( mediaPath ));
		counter++;
		dir.subdirs(mediaPath, (err, subdirs) => {
			counter--;
			if (err) {
				console.log('UpdateOnlineList error', err);
				return;
			}
			subdirs.forEach( path => {
				pathKeys.push( resolve(path) );
			});	

			if (counter === 0) {
				let onlineList = getPathsFiles( pathKeys );
				callback( onlineList );
			}
		});
	});

	function getPathsFiles( paths ) {
		var newList = {};
		paths.forEach( path => {
			let subfiles = getFiles( path, order);
			if (subfiles.length) {
				newList[ path] = subfiles;
			}
		});
		return newList;
	}
	
	function getFiles( mediaPath, order ) 
	{
		let mediaFiles = dir.files( mediaPath, {sync:true, recursive:false});

		let matchs = [/.mp4$/, /.rmvb$/, /.mkv$/];
		let isMediaFile = function(filename) {
			return matchs.some( regex => {
				return regex.test( filename );
			});
		};

		mediaFiles = mediaFiles.filter( fileName => {
			return isMediaFile( fileName );
		});
		
		return reOrderArray( mediaFiles, order );
	}
}

function genPlaylist( srcList, disableList, order, callback ) 
{
	disableList = disableList.map( x => {
		return resolve(x);
	});

	updateOnlineList( srcList, order, onlineList => {
		let newList = [];
		for (var path in onlineList) {
			if (disableList.indexOf(path) === -1) {
				newList = newList.concat( onlineList[path] );
			}
		}
		reOrderArray( newList, order );
		callback && callback( newList );
	});
}


var writer = null;

function writeBinFile( chunk ) 
{
	if (writer === null) {
		let filePath = './temp/images';
		if ( !fs.existsSync( filePath )) {
			fs.mkdirSync( filePath );
		}

		fs.readdir( filePath, (err, files) => {
			if (err) throw err;

			for (const file of files) {
				fs.unlink( path.join(filePath, file), err => {
					if (err) throw err;
				});
			}
		});

		writer = new FileOnWrite({
			path: filePath,
			ext: '.ts',
			filename: function(data) { 
				return data[0].toString(16) + '_' + data.length + '_' + Date.now().toString();
			}
		});
	}
	writer.write( chunk );
}


module.exports = {
	getMediaUrls,
	writeBinFile,
	genPlaylist
};
