
const SOI = new Buffer([0xff, 0xd8]);
const EOI = new Buffer([0xff, 0xd9]);

MjpegParser = function (image_callback) {
	if (!Buffer.prototype['indexOf']) bufferTools.extend();
	this.image_callback = image_callback;
	this._buffer = null;
}

MjpegParser.prototype.checkpoint = function (chunk) 
{
	let image = null;
	let imgStart, imgEnd;
	while (chunk) {
		if (this._buffer) {
			if (-1 != (imgEnd = chunk.indexOf(EOI))) {
				imgEnd += EOI.length;
				image = Buffer.concat([this._buffer, chunk.slice(0, imgEnd)]);
				this.image_callback(image);
				this._buffer = null;
				chunk = chunk.slice(imgEnd);
			} else {
				this._buffer = Buffer.concat([this._buffer, chunk]);
				chunk = null;
			}
		} else {
			chunk = -1 != (imgStart = chunk.indexOf(SOI)) ? chunk.slice(imgStart) : null;
			if (chunk) this._buffer = new Buffer(0);
		}
	}
}

MjpegParser.prototype.flush = function () {
	this._buffer = null;
};

module.exports = function(image_callback){
	return new MjpegParser(image_callback);
};
