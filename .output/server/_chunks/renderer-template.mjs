import { HTTPResponse } from "../_libs/h3+rou3+srvx.mjs";
//#region #nitro/virtual/renderer-template
var rendererTemplate = () => new HTTPResponse("<!doctype html>\n<html lang=\"pt-BR\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta name=\"theme-color\" content=\"#5b117a\" />\n    <meta name=\"description\" content=\"AÇAÍ DO CHALALA — Sistema de Gestão e Vendas\" />\n    <title>AÇAÍ DO CHALALA | Sistema de Gestão e Vendas</title>\n    <script type=\"module\" crossorigin src=\"/assets/index-Bp3e3wcc.js\"><\/script>\n    <link rel=\"stylesheet\" crossorigin href=\"/assets/index-CD25qj4n.css\">\n  </head>\n  <body>\n    <div id=\"root\"></div>\n  </body>\n</html>\n", { headers: { "content-type": "text/html; charset=utf-8" } });
//#endregion
//#region node_modules/.pnpm/nitro@3.0.260903-beta/node_modules/nitro/dist/runtime/internal/routes/renderer-template.mjs
function renderIndexHTML(event) {
	return rendererTemplate(event.req);
}
//#endregion
export { renderIndexHTML as default };
