
module.exports = class ManagerHandler 
{
	constructor(env) {
		this.handlerName = 'manager';
		this.nodeId = env.get('nodeId');
		this.eachClient = env.get('eachClient');
		this.chunkHead = 0x7b;	
		this.upstreamSocket = null;
		this.isCenter = env.get('isCenter');
		this.nodeInfos = env.get('nodeInfos');
		this.isCenter && setInterval(this.heartbeat.bind(this), 1000);
	}

	heartbeat () 
	{
		this.downstream( JSON.stringify({
			center: this.nodeId,
			handler: this.handlerName,
			cmd: 'nodeInfos',
			nodes: [ this.nodeInfos() ]
		}));
	}

	infos () 
	{
		return {
			module: this.handlerName,
			nodeId: this.nodeId,
			upstreamNodeId: this.upstreamNodeId
		};
	}

	onUpConnect (socket) 
	{
		this.upstreamSocket = socket;

		socket.send(JSON.stringify({
			user_id: this.nodeId,
			handler: this.handlerName,
			cmd: 'nodeId',
			back: this.nodeId
		}));
	}

	onResponseTrans(res) 
	{
		if (res.back === this.nodeId) {
			console.log(res);
			this.upstreamNodeId = res.nodeId;
			return null;
		}

		if (res.cmd === 'nodeInfos') {
			res.nodes.push(this.nodeInfos());
			return res;
		}

		return res;
	}

	onUpResponse (chunk, socket) 
	{
		let res = null;
		try {
			res = JSON.parse(chunk);
		} catch (e) {}

		if (res === null) {
			return;
		}

		let newRes = this.onResponseTrans(res);
		if (newRes === null) {
			return;
		}

		this.downstream(JSON.stringify(newRes));
	}

	downstream (chunk) 
	{
		this.eachClient(function each(client) {
			client.send(chunk);
		});
	}

	onDownRequest (socket, req) 
	{
		console.log(req);

		if (typeof req.to === 'undefined') {
			req.to = this.nodeId;
		}

		if (req.to !== this.nodeId) {
			if (typeof req.crumbs === 'undefined') {
				req.crumbs = [];
			}
			req.crumbs.push(req.user_id);
			req.user_id = this.nodeId;
			this.upstreamSocket.send(JSON.stringify(req));
			return;
		}

		 switch (req.cmd) {
		 	case 'nodeId':
				let res = {nodeId: this.nodeId};
				if (req.back) {
					res.back = req.back;
				}
				socket.send(JSON.stringify(res));
				return;
			default:
		 }

	}
};

