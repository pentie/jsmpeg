
const { exec } = require('child_process');
const ffmpeg = require('fluent-ffmpeg');
const PassThroughStream = require('stream').PassThrough;
const net = require('net');
const uuidv1 = require('uuid/v1');
const FileOnWrite = require('file-on-write');
const fs = require('fs');
const path = require('path');

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

const SOI = new Buffer([0xff, 0xd8]);
const EOI = new Buffer([0xff, 0xd9]);

class MjpegStreamToJpegs
{
	constructor( jpegCallback ) 
	{
		if (!Buffer.prototype['indexOf']) bufferTools.extend();
		this.jpegCallback = jpegCallback;
		this._buffer = null;
	}

	checkpoint( chunk ) 
	{
		let image = null;
		let imgStart, imgEnd;
		while (chunk) {
			if (this._buffer === null) {
				chunk = -1 != (imgStart = chunk.indexOf(SOI)) ? chunk.slice(imgStart) : null;
				if (chunk) this._buffer = new Buffer(0);
				continue;
			}

			if (-1 != (imgEnd = chunk.indexOf(EOI))) {
				imgEnd += EOI.length;
				image = Buffer.concat([this._buffer, chunk.slice(0, imgEnd)]);
				this.jpegCallback(image);
				this._buffer = null;
				chunk = chunk.slice(imgEnd);
				continue;
			}

			this._buffer = Buffer.concat( [this._buffer, chunk] );
			chunk = null;
		}
	}

	flush() {
		this._buffer = null;
	}
}

class ChunksFromFFmpegBase
{
	constructor( config, chunksCallback ) 
	{
		this.config = config;
		this.jobId =  uuidv1();
		this.output = new PassThroughStream();
		this.output.on('data', chunksCallback );
		this.output.on('error', this.onError.bind(this));
	}

	onFFmpegStart( cmdline ) {
		//console.log( this.constructor.name, cmdline);
	}

	onFFmepgEnd () {
		console.log( this.constructor.name, ': ffmpeg processing finished !');
	}

	onError (err) {
		console.log( this.constructor.name, 'error occurred: ' + err.message);
		if (this.constructor.name === 'JpegsFromMp4File') {
			console.log(this.mp4File);
		}
	}
}

class JpegsFromFFmpegBase extends ChunksFromFFmpegBase
{
	constructor( config, jpegsCallback ) 
	{
		let extractor = new MjpegStreamToJpegs( jpegsCallback );
		super( config, function(chunk) {
			extractor.checkpoint(chunk);
		});
	}
}

class JpegsFromMp4File extends JpegsFromFFmpegBase
{
	constructor( config, mp4File, jpegsCallback, endCallback ) 
	{
		super(config, jpegsCallback);
		this.mp4File = mp4File;
		this.endCallback = endCallback || this.onFFmepgEnd.bind(this) ;
		this.errCallback = endCallback || this.onError.bind(this) ;
	}

	start( callback ) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		let inputOptions = this.config.inputOptions? this.config.inputOptions : [];

		this.command = ffmpeg()
			.input( this.mp4File )
			.native()
			.inputOptions( inputOptions )
			.output( this.output )
			.outputOptions([ '-f mjpeg', '-c:v mjpeg' ])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.errCallback)
			.on('end', this.endCallback);

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

class JpegsFromWebCamera extends JpegsFromFFmpegBase
{
	constructor( config, url, jpegsCallback, endCallback, errCallback ) 
	{
		super(config, jpegsCallback);
		this.url = url;
		this.endCallback = endCallback || this.onFFmepgEnd.bind(this) ;
		this.errCallback = errCallback || this.onError.bind(this) ;
	}

	start (callback) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		let inputOptions = this.config.inputOptions? this.config.inputOptions : [];

		this.command = ffmpeg()
			.input(this.url)
			.inputOptions( inputOptions )
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v mjpeg'])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.errCallback)
			.on('end', this.endCallback);
		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

class JpegsFromUsbCamera extends JpegsFromFFmpegBase
{
	constructor( config, devPath, jpegsCallback, endCallback, errCallback ) 
	{
		super( config, jpegsCallback );
		this.devPath = devPath;
		this.command = null;
		this.endCallback = endCallback || this.onFFmepgEnd.bind(this) ;
		this.errCallback = errCallback || this.onError.bind(this) ;
	}

	start( callback ) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
	
		let inputOptions = this.config.inputOptions? this.config.inputOptions : ['-f v4l2'];
		if (inputOptions.indexOf('-f v4l2') === -1) {
			inputOptions.push( '-f v4l2' );
		}

		this.command = ffmpeg()
			.input(this.devPath)
			.inputOptions( inputOptions )
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v mjpeg'])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.errCallback)
			.on('end', this.endCallback);

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

class Mpeg1tsFromJpegs extends ChunksFromFFmpegBase
{
	constructor( config, mpegtsCallback, qscale=8, endCallback ) 
	{
		super( config, mpegtsCallback );
		this.qscale = qscale;
		
		this.input = new PassThroughStream();
		this.input.on('error', this.onError.bind(this));
		this.endCallback = endCallback || this.onFFmepgEnd.bind(this) ;
		this.errCallback = endCallback || this.onError.bind(this) ;
	}

	write( chunk ) {
		this.input.write(chunk);	
	}

	start( callback ) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		this.command = ffmpeg()
			.input(this.input)
			.inputFormat('mjpeg')
			.output(this.output)
			.outputOptions(['-f mpegts', '-c:v mpeg1video', '-q:v '+ this.qscale, '-bf 0'])
			.outputFps(30)
			.on('start', callback)
			.on('error', this.errCallback)
			.on('end', this.endCallback);

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

class JpegsToLiveRtmp
{
	constructor( config, endCallback ) 
	{
		this.config = config;
		this.input = new PassThroughStream();
		this.input.on('error', endCallback);
		this.endCallback = endCallback;
	}

	write( chunk ) {
		this.input.write(chunk);	
	}

	onError( error, stdout, stderr ) 
	{
		console.log(stdout);
		console.log(stderr);
	}

	onEnd( error ) 
	{
		this.endCallback( error );
	}

	onStart( cmdline ) 
	{
		console.log( this.constructor.name, cmdline);
	}

	start( startCallback ) 
	{
		startCallback = startCallback || this.onStart.bind(this); 

		this.command = ffmpeg();
		this.command.input(this.input);
		this.command.inputFormat('mjpeg');

		this.config.inputs.forEach( (config) => {
			if (config.active !== undefined) {
				if (config.active !== true) {
					return;
				}
			}

			this.command.input( config.inputFrom );
			this.command.inputOptions( config.options );
		});

		this.config.outputs.forEach( (config) => {
			if (config.active !== undefined) {
				if (config.active !== true) {
					return;
				}
			}

			this.command.output( config.outputTo );
			this.command.outputOptions( config.options );
		});

		this.command.on('start', startCallback )
		this.command.on('error', this.onError.bind(this) );
		this.command.on('end', this.onEnd.bind(this) );
		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

class LocalToLiveRtmp
{
	constructor( config, endCallback ) 
	{
		this.config = config;
		// this.input = new PassThroughStream();
		// this.input.on('error', endCallback);
		this.endCallback = endCallback;
	}

	write( chunk ) { return; }

	onError( error, stdout, stderr ) 
	{
		console.log(stdout);
		console.log(stderr);
		this.endCallback( error );
	}

	onEnd( error ) 
	{
		this.endCallback( error );
	}

	onStart( cmdline ) 
	{
		console.log( this.constructor.name, cmdline);
	}

	start( startCallback ) 
	{
		startCallback = startCallback || this.onStart.bind(this); 

		this.command = ffmpeg();
		// this.command.input(this.input);
		// this.command.inputFormat('mjpeg');

		this.config.inputs.forEach( (config) => {
			if (config.active !== undefined) {
				if (config.active !== true) {
					return;
				}
			}

			this.command.input( config.inputFrom );
			this.command.inputOptions( config.options );
		});

		this.config.outputs.forEach( (config) => {
			if (config.active !== undefined) {
				if (config.active !== true) {
					return;
				}
			}

			this.command.output( config.outputTo );
			this.command.outputOptions( config.options );
		});

		this.command.on('start', startCallback )
		this.command.on('error', this.onError.bind(this) );
		this.command.on('end', this.onEnd.bind(this) );
		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill('SIGKILL');
	}
}

module.exports = {
	writeBinFile,
	JpegsFromWebCamera,
	JpegsFromUsbCamera,
	JpegsFromMp4File,
	Mpeg1tsFromJpegs,
	JpegsToLiveRtmp,
	LocalToLiveRtmp
};
