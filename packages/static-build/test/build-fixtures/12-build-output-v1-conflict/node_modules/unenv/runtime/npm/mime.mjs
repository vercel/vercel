import _mime from "_mime";
const mime = { ..._mime };
mime.lookup = mime.getType;
mime.extension = mime.getExtension;
const noop = () => {
};
mime.define = noop;
mime.load = noop;
mime.default_type = "application/octet-stream";
mime.charsets = { lookup: () => "UTF-8" };
export default mime;
