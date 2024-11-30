export default (c) => {
	const cfIp = c.req.header("cf-connecting-ip");
	const peerAddr = c.env.incoming.socket.remoteAddress;
	// NOTE: this is a very not ok way to handle x-forwarded-for, but we trust our reverse proxies! mostly!
	const xff = c.req.headers.get("x-forwarded-for")?.split(",")[0];

	return cfIp ?? xff ?? peerAddr;
}
