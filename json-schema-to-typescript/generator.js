const { memoize, omit } = require("lodash");
const { DEFAULT_OPTIONS } = require("./options");
const {
  hasComment,
  hasStandaloneName,
  T_ANY,
  T_UNKNOWN,
} = require("./types/AST");
const { log, toSafeString } = require("./utils");

module.exports.generate = (ast, options = DEFAULT_OPTIONS) => {
  return !hasStandaloneName(ast)
    ? generateRawType(ast, options)
    : [
        options.bannerComment,
        declareNamedTypes(ast, options, ast.standaloneName),
        declareNamedInterfaces(ast, options, ast.standaloneName),
        declareEnums(ast, options),
      ]
        .filter(Boolean)
        .join("\n\n") + "\n"; // trailing newline
};

function declareEnums(ast, options, processed = new Set()) {
  if (processed.has(ast)) {
    return "";
  }

  processed.add(ast);
  let type = "";

  switch (ast.type) {
    case "ENUM":
      return generateStandaloneEnum(ast, options) + "\n";
    case "ARRAY":
      return declareEnums(ast.params, options, processed);
    case "UNION":
    case "INTERSECTION":
      return ast.params.reduce(
        (prev, ast) => prev + declareEnums(ast, options, processed),
        ""
      );
    case "TUPLE":
      type = ast.params.reduce(
        (prev, ast) => prev + declareEnums(ast, options, processed),
        ""
      );
      if (ast.spreadParam) {
        type += declareEnums(ast.spreadParam, options, processed);
      }
      return type;
    case "INTERFACE":
      return getSuperTypesAndParams(ast).reduce(
        (prev, ast) => prev + declareEnums(ast, options, processed),
        ""
      );
    default:
      return "";
  }
}

function declareNamedInterfaces(
  ast,
  options,
  rootASTName,
  processed = new Set()
) {
  if (processed.has(ast)) {
    return "";
  }

  processed.add(ast);
  let type = "";

  switch (ast.type) {
    case "ARRAY":
      type = declareNamedInterfaces(
        ast.params,
        options,
        rootASTName,
        processed
      );
      break;
    case "INTERFACE":
      type = [
        hasStandaloneName(ast) &&
          (ast.standaloneName === rootASTName ||
            options.declareExternallyReferenced) &&
          // generateStandaloneInterface(ast, options),
          generateStandaloneType(ast, options),
        getSuperTypesAndParams(ast)
          .map((ast) =>
            declareNamedInterfaces(ast, options, rootASTName, processed)
          )
          .filter(Boolean)
          .join("\n"),
      ]
        .filter(Boolean)
        .join("\n");
      break;
    case "INTERSECTION":
    case "TUPLE":
    case "UNION":
      type = ast.params
        .map((_) => declareNamedInterfaces(_, options, rootASTName, processed))
        .filter(Boolean)
        .join("\n");
      if (ast.type === "TUPLE" && ast.spreadParam) {
        type += declareNamedInterfaces(
          ast.spreadParam,
          options,
          rootASTName,
          processed
        );
      }
      break;
    default:
      type = "";
  }

  return type;
}

function declareNamedTypes(ast, options, rootASTName, processed = new Set()) {
  if (processed.has(ast)) {
    return "";
  }

  processed.add(ast);

  switch (ast.type) {
    case "ARRAY":
      return [
        declareNamedTypes(ast.params, options, rootASTName, processed),
        hasStandaloneName(ast)
          ? generateStandaloneType(ast, options)
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");
    case "ENUM":
      return "";
    case "INTERFACE":
      return getSuperTypesAndParams(ast)
        .map(
          (ast) =>
            (ast.standaloneName === rootASTName ||
              options.declareExternallyReferenced) &&
            declareNamedTypes(ast, options, rootASTName, processed)
        )
        .filter(Boolean)
        .join("\n");
    case "INTERSECTION":
    case "TUPLE":
    case "UNION":
      return [
        hasStandaloneName(ast)
          ? generateStandaloneType(ast, options)
          : undefined,
        ast.params
          .map((ast) => declareNamedTypes(ast, options, rootASTName, processed))
          .filter(Boolean)
          .join("\n"),
        "spreadParam" in ast && ast.spreadParam
          ? declareNamedTypes(ast.spreadParam, options, rootASTName, processed)
          : undefined,
      ]
        .filter(Boolean)
        .join("\n");
    default:
      if (hasStandaloneName(ast)) {
        return generateStandaloneType(ast, options);
      }
      return undefined;
  }
}

function generateTypeUnmemoized(ast, options) {
  const type = generateRawType(ast, options);

  if (options.strictIndexSignatures && ast.keyName === "[k]") {
    return `${type} `;
  }

  return type;
}
module.exports.generateType = memoize(generateTypeUnmemoized);

function generateRawType(ast, options) {
  log("magenta", "generator", ast);

  if (hasStandaloneName(ast)) {
    return toSafeString(ast.standaloneName);
  }

  switch (ast.type) {
    case "ANY":
      return "any";
    case "ARRAY":
      return (() => {
        const type = module.exports.generateType(ast.params, options);
        return type.endsWith('"') ? "(" + type + ")[]" : type + "[]";
      })();
    case "BOOLEAN":
      return "boolean";
    case "INTERFACE":
      return generateInterface(ast, options);
    case "INTERSECTION":
      return generateSetOperation(ast, options);
    case "LITERAL":
      return JSON.stringify(ast.params);
    case "NUMBER":
      return "number";
    case "NULL":
      return "null";
    case "OBJECT":
      return "object";
    case "REFERENCE":
      return ast.params;
    case "STRING":
      return "string";
    case "TUPLE":
      return (() => {
        const minItems = ast.minItems;
        const maxItems = ast.maxItems || -1;

        let spreadParam = ast.spreadParam;
        const astParams = [...ast.params];
        if (
          minItems > 0 &&
          minItems > astParams.length &&
          ast.spreadParam === undefined
        ) {
          // this is a valid state, and JSONSchema doesn't care about the item type
          if (maxItems < 0) {
            // no max items and no spread param, so just spread any
            spreadParam = options.unknownAny ? T_UNKNOWN : T_ANY;
          }
        }
        if (maxItems > astParams.length && ast.spreadParam === undefined) {
          // this is a valid state, and JSONSchema doesn't care about the item type
          // fill the tuple with any elements
          for (let i = astParams.length; i < maxItems; i += 1) {
            astParams.push(options.unknownAny ? T_UNKNOWN : T_ANY);
          }
        }
        function addSpreadParam(params) {
          if (spreadParam) {
            const spread = "...(" + module.exports.generateType(spreadParam, options) + ")[]";
            params.push(spread);
          }
          return params;
        }
        function paramsToString(params) {
          return "[" + params.join(", ") + "]";
        }
        const paramsList = astParams.map((param) =>
        module.exports.generateType(param, options)
        );
        if (paramsList.length > minItems) {
          /*
        if there are more items than the min, we return a union of tuples instead of
        using the optional element operator. This is done because it is more typesafe.

        // optional element operator
        type A = [string, string?, string?]
        const a: A = ['a', undefined, 'c'] // no error

        // union of tuples
        type B = [string] | [string, string] | [string, string, string]
        const b: B = ['a', undefined, 'c'] // TS error
        */

          const cumulativeParamsList = paramsList.slice(0, minItems);
          const typesToUnion = [];
          if (cumulativeParamsList.length > 0) {
            // actually has minItems, so add the initial state
            typesToUnion.push(paramsToString(cumulativeParamsList));
          } else {
            // no minItems means it's acceptable to have an empty tuple type
            typesToUnion.push(paramsToString([]));
          }
          for (let i = minItems; i < paramsList.length; i += 1) {
            cumulativeParamsList.push(paramsList[i]);
            if (i === paramsList.length - 1) {
              // only the last item in the union should have the spread parameter
              addSpreadParam(cumulativeParamsList);
            }
            typesToUnion.push(paramsToString(cumulativeParamsList));
          }
          return typesToUnion.join("|");
        }

        // no max items so only need to return one type
        return paramsToString(addSpreadParam(paramsList));
      })();
    case "UNION":
      return generateSetOperation(ast, options);
    case "UNKNOWN":
      return "unknown";
    case "CUSTOM_TYPE":
      return ast.params;
  }
}

/**
 * Generate a Union or Intersection
 */
function generateSetOperation(ast, options) {
  const members = ast.params.map((_) => module.exports.generateType(_, options));
  const separator = ast.type === "UNION" ? "|" : "&";
  return members.length === 1
    ? members[0]
    : "(" + members.join(" " + separator + " ") + ")";
}

function generateInterface(ast, options) {
  return (
    `{` +
    "\n" +
    ast.params
      .filter((_) => !_.isPatternProperty && !_.isUnreachableDefinition)
      .map(({ isRequired, keyName, ast }) => [
        isRequired,
        keyName,
        ast,
        module.exports.generateType(ast, options),
      ])
      .map(
        ([isRequired, keyName, ast, type]) =>
          (hasComment(ast) && !ast.standaloneName
            ? generateComment(ast.comment) + "\n"
            : "") +
          escapeKeyName(keyName) +
          (isRequired ? "" : "?") +
          ": " +
          (hasStandaloneName(ast) ? toSafeString(type) : type)
      )
      .join(";\n") +
    "\n" +
    "}"
  );
}

function generateComment(comment) {
  return ["/**", ...comment.split("\n").map((_) => " * " + _), " */"].join(
    "\n"
  );
}

function generateStandaloneEnum(ast, options) {
  return (
    (hasComment(ast) ? generateComment(ast.comment) + "\n" : "") +
    "export " +
    (options.enableConstEnums ? "const " : "") +
    `enum ${toSafeString(ast.standaloneName)} {` +
    "\n" +
    ast.params
      .map(({ ast, keyName }) => keyName + " = " + module.exports.generateType(ast, options))
      .join(",\n") +
    "\n" +
    "}"
  );
}

function generateStandaloneType(ast, options) {
  return (
    (hasComment(ast) ? generateComment(ast.comment) + "\n" : "") +
    `export type ${toSafeString(ast.standaloneName)} = ${module.exports.generateType(
      omit(ast, "standaloneName"),
      options
    )}`
  );
}

function escapeKeyName(keyName) {
  if (
    keyName.length &&
    /[A-Za-z_$]/.test(keyName.charAt(0)) &&
    /^[\w$]+$/.test(keyName)
  ) {
    return keyName;
  }
  if (keyName === "[k]") {
    return keyName;
  }
  return JSON.stringify(keyName);
}

function getSuperTypesAndParams(ast) {
  return ast.params.map((param) => param.ast).concat(ast.superTypes);
}
