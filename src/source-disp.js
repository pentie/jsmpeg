JSMpeg.Source.Dispatch = (function(){ "use strict";

var SourceDisp = function(options) {
	this.options = options;
	this.distList = new Array();
};

SourceDisp.SOURCEID = {
	SOURCE_MPEG1: 0x47, 
	SOURCE_MJPEG: 0xFFD8, 
	SOURCE_JSON: 0x5b
};

SourceDisp.prototype.connect = function(sourceId, destination) {
	this.distList.push({
		headSign: sourceId,
		destination: destination
	});
};

SourceDisp.prototype.write = function(buffer) {
	var dataView = new DataView(buffer);
	var signs = [dataView.getUint8(0), dataView.getUint16(0)];

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


