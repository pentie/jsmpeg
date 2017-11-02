
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
		this.edgeNodes = [];
	}

	heartbeat () 
	{
		this.downstream( JSON.stringify({
			cmd: 'report',
			nodes: [ this.nodeInfos() ],
			edgeNodes: this.edgeNodes
		}));

		this.edgeNodes.length = 0;
	}

	infos () 
	{
		var count = 0;
		this.eachClient(function each(socket){
			socket.isNode && count++;
		});

		return {
			upstreamNodeId: this.upstreamNodeId,
			downstreamNodeCount: count
		};
	}

	onUpConnect (socket) 
	{
		this.upstreamSocket = socket;

		socket.send(JSON.stringify({
			handler: this.handlerName,
			userId: this.nodeId,
			cmd: 'getNodeId',
			back: this.nodeId
		}));
	}

	onUpResponseTrans(res, socket) 
	{
		switch (res.cmd) {
			case 'getNodeId':
				if (res.to === this.nodeId) {
					this.upstreamNodeId = res.nodeId;
				}
				return null;

			case 'report':
				let infos = this.nodeInfos();
				res.nodes.push(infos);

				socket.send( JSON.stringify({
					handler: this.handlerName,
					userId: this.nodeId,
					cmd: 'report',
					to: 'center',
					infos: infos
				}));

				return res;

			default:
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

		let newRes = this.onUpResponseTrans(res, socket);
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
		if (typeof req.to === 'undefined') {
			req.to = this.nodeId;
		}

		if (req.to === 'center') {
			if (this.isCenter) {
				req.to = this.nodeId;
			}
		}

		if (req.to !== this.nodeId) {
			if (typeof req.crumbs === 'undefined') {
				req.crumbs = [];
			}
			req.crumbs.push(req.userId);
			req.userId = this.nodeId;
			this.upstreamSocket.send(JSON.stringify(req));
			return;
		}

		switch (req.cmd) {
			case 'getNodeId':
				console.log(req);
				let res = {nodeId: this.nodeId};
				if (req.back) {
					res.to = req.back;
				}
				socket.isNode = true;
				socket.send(JSON.stringify(res));
				return;

			case 'report':
				this.edgeNodes.push(req.infos);
				return;
			default:
		}

	}
};

