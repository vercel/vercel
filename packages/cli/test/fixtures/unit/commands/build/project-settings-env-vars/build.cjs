const fs = require('fs');
const { join } = require('path');
fs.mkdirSync(join(__dirname , 'out'), { recursive: true });
fs.writeFileSync(join(__dirname , 'out', 'env.json'), JSON.stringify(process.env));
