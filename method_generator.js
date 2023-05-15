const { compile } = require("./json-schema-to-typescript");
const util = require("util");

function genApiMethodParams(op) {
  const paramsStrArr = [...op.url.matchAll(/{(.+?)}/g)]
    .map((x) => x[1])
    .map((x) => `${x}: string`);
  const paramsInQuery = op.params
    ? op.params.filter((x) => x.in === "query")
    : [];
  if (paramsInQuery.length) {
    // Beacause of query string specification, we can have at this point params with names like
    // param[name1], param[name2], param[name3] and so on. But in typescript we can't have
    // params with names like this. So we need to group them into one object.
    // e.g. param[name1], param[name2], param[name3] => param: {name1: string; name2: string; name3: string}

    const baseParams = paramsInQuery.filter((x) => !x.name.includes("["));
    const splitedParams = paramsInQuery
      .filter((x) => x.name.includes("["))
      .map((x) => {
        const baseName = x.name.split("[")[0];
        const subParamName = x.name.split("[")[1]?.replace("]", "");
        return { ...x, name: baseName, subParamName };
      });
    const groupedParams = splitedParams.reduce((acc, x) => {
      const existing = acc.find((y) => y.name === x.name);
      if (existing) {
        existing.subParams.push({
          ...x,
          name: x.subParamName,
        });
      } else {
        acc.push({
          name: x.name,
          subParams: [
            {
              ...x,
              name: x.subParamName,
            },
          ],
        });
      }
      return acc;
    }, []);

    const transformedParams = groupedParams.map((x) => {
      return {
        name: x.name,
        required: x.subParams.some((x) => x.required),
        schema: {
          type: "object",
          properties: x.subParams.reduce((acc, x) => {
            acc[x.name] = x.schema;
            return acc;
          }, {}),
          required: x.subParams.filter((x) => x.required).map((x) => x.name),
        },
      };
    });

    const queryType = [...baseParams, ...transformedParams]
      .map((x) => {
        const paramType = compile(x.schema, null);
        return `${x.name}${x.required ? "" : "?"}: ${paramType}`;
      })
      .join("; ");

    paramsStrArr.push(`query: {${queryType}}`);
  }

  if (op.reqBody) {
    const payloadType = compile(
      Object.values(op.reqBody.content)[0].schema,
      null
    );
    paramsStrArr.push(
      `payload${op.reqBody.required ? "" : "?"}: ${payloadType}`
    );
  }

  op.security?.map((x) => {
    const t = Object.keys(x)[0];
    const s = op.oa.components?.securitySchemes?.[t];
    if (s?.type === "http" && s?.scheme === "bearer") {
      paramsStrArr.push(`bearerToken: string`);
    }
  });

  return paramsStrArr
    .sort((a, b) => a.indexOf("?") - b.indexOf("?"))
    .join(", ");
}

function genDocs(op) {
  return op.responses
    .sort((x) => x.code)
    .map((x) => {
      const codeIsOk = x.code > 199 && x.code < 299;
      const descrExists = /\S/.test(x.description ?? "");
      return `
			* @example ${x.code}: ${
        descrExists
          ? `"${x.description}"`
          : codeIsOk
          ? `=> ${
              genResponseType(op, x.code)?.replace(/\r?\n|\r/g, " ") ?? "null"
            } `
          : ""
      }
		`.trim();
    })
    .join("\n");
}

function genResponseType(op, code) {
  const r = op.responses.find((x) => x.code == code);
  if (r?.content) {
    const schema = Object.values(r.content)[0].schema;
    return compile(schema, null);
  } else return null;
}

function genRequest(op) {
  const reqInit = {
    method: op.httpMethodType.toUpperCase(),
  };
  switch (true) {
    case !Boolean(op.reqBody):
      break;
    case Object.entries(op.reqBody.content).length !== 1:
      throw { msg: "Unhandled schema RequestBody case", ref: op };
    case "application/json" in op.reqBody.content: {
      reqInit.headers = {
        "Content-Type": "application/json",
      };
      reqInit.body = '"JSON.stringify(payload)"';
      break;
    }
    case "multipart/form-data" in op.reqBody.content: {
      reqInit.body = '"formData"';
      break;
    }
    default:
      throw { msg: "Unhandled schema RequestBody case", ref: op };
  }

  op.security?.map((x) => {
    const t = Object.keys(x)[0];
    const s = op.oa.components?.securitySchemes?.[t];
    if (s?.type === "http" && s?.scheme === "bearer") {
      reqInit.headers = {
        ...reqInit.headers,
        Authorization: '"`Bearer ${bearerToken}`"',
      };
    }
  });

  return util
    .inspect(reqInit, { showHidden: false, depth: null })
    .replace(/('")|("')/g, "");
}

module.exports = {
  generateApiMethod(op, baseUrlName) {
    const dataType = genResponseType(op, 200);
    const paramsInQuery = op.params
      ? op.params.filter((x) => x.in === "query")
      : [];
    return `
		/**
		${genDocs(op)}
		*/
		${op.name}: (${genApiMethodParams(op)}) => {
			${
        op.reqBody && "multipart/form-data" in op.reqBody.content
          ? Object.values(
              Object.values(op.reqBody.content)[0]?.schema?.properties
            )[0]?.type === "array"
            ? `
					const formData = new FormData();
					Object.entries(payload).forEach(([key, val]) => val.forEach((v) => formData.append(key, v)));
				`
            : `
					const formData = new FormData();
					Object.entries(payload).forEach(([key, val]) => formData.append(key, val));
				`
          : ""
      }
			return fetchWrapper.send${
        dataType ? `<${dataType}>` : ""
      }(\`\${${baseUrlName}}${op.url.replace(/{/g, "${")}\`, ${genRequest(op)}${
      paramsInQuery.length ? ", query" : ""
    });
		}
	`.trim();
  },
};
