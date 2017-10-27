JSMpeg.Source.Dispatch = (function(){ "use strict";

var SourceDisp = function(options) {
	this.options = options;
	this.distList = new Array();
};

SourceDisp.SOURCEID = {
	SOURCE_MPEG1: 0x47, 
	SOURCE_MJPEG: 0xFFD8, 
	SOURCE_JSON: 0x7b
};

SourceDisp.prototype.connect = function(sourceId, destination) {
	this.distList.push({
		headSign: sourceId,
		destination: destination
	});
};

SourceDisp.prototype.write = function(buffer) {
	var signs = [];

	if (typeof buffer === 'string') {
		signs.push(buffer.charCodeAt(0));
	} else {

		var dataView = new DataView(buffer);
		signs.push(dataView.getUint8(0));
		signs.push(dataView.getUint16(0));
	}

	var done = signs.some(function each(sign) {
		return this.distList.some(function each(dist) {
			if (sign === dist.headSign) {
				dist.destination.write(buffer);
				return true;
			}
			return false;
		});
	}, this);

	!done && console.log('unknow binary data: ', signs, SourceDisp.SOURCEID);
};

return SourceDisp;

})();


