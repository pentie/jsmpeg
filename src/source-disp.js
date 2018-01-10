JSMpeg.Source.Dispatch = (function(){ "use strict";

var SourceDisp = function(options) {
	this.options = options;
	this.distList = {};
};

SourceDisp.SOURCEID = {
	SOURCE_MPEG1: 'MPEG1', 
	SOURCE_MJPEG: 'MJPEG', 
	SOURCE_JSON: 'JSON'
};

SourceDisp.prototype.connect = function(sourceId, destination) {
	this.distList[ sourceId ] = destination;
};

SourceDisp.prototype.write = function(buffer) {
	if (typeof buffer === 'string') {
		this.distList['JSON'].write(buffer);
		return;
	}

	var dataView = new DataView(buffer);
	var sign = dataView.getUint16(0);

	if (sign === 0xFFD8) {
		this.distList['MJPEG'].write(buffer);
		return;
	}

	this.distList['MPEG1'].write(buffer);
};

return SourceDisp;

})();


