const net = require('net');

const client = net.createConnection({ port: 10001 }, () => {
    client.write(Buffer.from('\x01i10100FF'));
});

client.on('data', (data) => {
    console.log('Raw response:', JSON.stringify(data.toString('ascii')));
    client.end();
});