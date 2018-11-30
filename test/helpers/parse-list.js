module.exports = stdout => stdout.split('\n').filter(line => line.includes('.now.sh')).map(line => line.split(' ').filter(part => part.includes('.now.sh'))[0]);
