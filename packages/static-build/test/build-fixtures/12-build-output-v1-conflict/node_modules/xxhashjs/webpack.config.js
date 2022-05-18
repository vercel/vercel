var path = require("path")

module.exports = {
	"entry": "./lib/index.js"
,	"output": {
		"path": __dirname + "/build"
	,	"filename": "xxhash.js"
	,	"library": "XXH"
	,	"libraryTarget": "umd"
	}
}
