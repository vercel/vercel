import mock from "../mock/proxy.mjs";
export default mock.__createMock__("consola", {
  ...console
});
