
var ffmpeg = require('fluent-ffmpeg');
var PassThroughStream = require('stream').PassThrough;
var net = require('net');

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
		this.output = new PassThroughStream();
		this.output.on('data', chunksCallback );
		this.output.on('error', this.onError.bind(this));
	}

	onFFmpegStart( cmdline ) {
		console.log( this.constructor.name, cmdline);
	}

	onFFmepgEnd () {
		console.log( this.constructor.name, ': Processing finished !');
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
		this.endCallback = endCallback;
	}

	start( callback ) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		this.command = ffmpeg()
			.input( this.mp4File )
			.native()
			.output( this.output )
			.outputOptions([ '-f mjpeg', '-c:v mjpeg' ])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.onError.bind(this))
			.on('end', this.endCallback );

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class JpegsFromWebCamera extends JpegsFromFFmpegBase
{
	constructor( config, url, jpegsCallback ) 
	{
		super(config, jpegsCallback);
		this.url = url;
	}

	start (callback) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		this.command = ffmpeg()
			.input(this.url)
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v mjpeg'])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this));
		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class JpegsFromUsbCamera extends JpegsFromFFmpegBase
{
	constructor( config, devPath, jpegsCallback ) 
	{
		super( config, jpegsCallback );
		this.devPath = devPath;
		this.command = null;
	}

	start( callback ) 
	{
		callback = callback || this.onFFmpegStart.bind(this);
		this.command = ffmpeg()
			.input(this.devPath)
			.inputOptions( ['-f v4l2'] )
			.output(this.output)
			.outputOptions(['-f mjpeg', '-c:v mjpeg'])
			.videoFilters( this.config.filter )
			.size( this.config.size )
			.on('start', callback)
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this));

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

class Mpeg1tsFromJpegs extends ChunksFromFFmpegBase
{
	constructor( config, mpegtsCallback, qscale=8 ) 
	{
		super( config, mpegtsCallback );
		this.qscale = qscale;
		
		this.input = new PassThroughStream();
		this.input.on('error', this.onError.bind(this));
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
			.on('error', this.onError.bind(this))
			.on('end', this.onFFmepgEnd.bind(this));

		this.command.run();
		return this;
	}

	stop() {
		this.command && this.command.kill();
	}
}

module.exports = {
	JpegsFromWebCamera,
	JpegsFromUsbCamera,
	JpegsFromMp4File,
	Mpeg1tsFromJpegs
};
