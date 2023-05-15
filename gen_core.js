const { compile } = require("./json-schema-to-typescript");
const { generateApiMethod } = require("./method_generator");

module.exports.genMethods = (oa, contractsFilename, fetchWrapperFilename) => {
  const methods = Object.entries(oa.paths)
    .map(([pathKey, pathProps]) =>
      Object.entries(pathProps).map(([opKey, opProps]) => {
        const op = opProps;
        const [cName, mName] = (op.operationId || "")
          .replace("Controller", "")
          .split("_");
        const operation = {
          oa: oa,
          controllerName: cName,
          name: mName,
          url: pathKey,
          httpMethodType: opKey,
          security: op.security,
          params: op.parameters,
          reqBody: op.requestBody,
          responses: op.responses
            ? Object.entries(op.responses).map(([rKey, rProps]) => ({
                ...rProps,
                code: parseInt(rKey),
              }))
            : [],
        };
        return operation;
      })
    )
    .flat();

  const controllersMap = new Map(
    new Set(methods.map((x) => x.controllerName).map((x) => [x, []]))
  );
  methods.forEach((x) => controllersMap.get(x.controllerName).push(x));

  const methodsStr = [...controllersMap]
    .map(([controllerName, ops]) => {
      return `\n${controllerName}: {\n${ops
        .map((x) => generateApiMethod(x))
        .join(",\n")}\n},`;
    })
    .join("\n");

  const apiClassStr = `
  import { API_BASE_URL } from './constants';
	import {
		${Object.keys(oa.components.schemas)
      .filter((x) => new RegExp(`\\W${x}\\W`, "g").test(methodsStr))
      .join(",\n")}
	} from './${contractsFilename}';
	import { fetchWrapper } from './${fetchWrapperFilename}';

	export const api = {
		${methodsStr}
	}`;
  return apiClassStr;
};

module.exports.genData = (oa) => {
  const typesStr = Object.entries(oa.components.schemas).map(([key, val]) =>
    compile(val, key)
  );
  return typesStr.join("\n");
};
