
const configs = require('config').get('playerNodes');
const MPlayer = require('mplayer');
const waitForPort = require('wait-for-port');

var taskQueue = [];

configs.forEach( function( config ) {
	if (config.active !== true) {
		return;
	}

	let cmdlineArgs = [
		'-vo x11 -screen '+ config.screen,
		'-fs -zoom',
		'-nocache',
		'-demuxer lavf'
	].join(' ');

	let options = { 
		debug: config.debug, 
		verbose: config.verbose, 
		args: cmdlineArgs,
		oriTaskUrl: config.url
	};

	taskQueue.push(options);
});


function cleanJobs() 
{
	while( taskQueue.length ) {
		let options = taskQueue.shift();

		options.verbose = false;
		
		if(options.verbose) {
			console.log('==============================');
			console.log('run new job: ', options);
			console.log('==============================');
		}

		let player = new MPlayer(options);
		player.oriTask = options;

		player.openFile( options.oriTaskUrl );
		player.play();

		player.timePass = 0;
		player.on('time', function(time) {
			this.timePass = time;
		}.bind(player));

		setTimeout(function(item){
			let time = parseFloat(item.timePass);
			if (time < 1) {
				item.player.instance.kill();
			}
		}, 3000, player);


		player.on('stop', function(code) {
			console.log('mplayer stoped. restarting');
			taskQueue.push(this.oriTask);
		}.bind(player));
	}
}


function run()
{
	cleanJobs();
	setTimeout( function(){
		run();
	}, 3000);
}

run();


