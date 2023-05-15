const {
  findKey,
  includes,
  isPlainObject,
  map,
  memoize,
  omit,
} = require("lodash");
const { typesOfSchema } = require("./typesOfSchema");
const { getRootSchema, isPrimitive } = require("./types/JSONSchema");
const {
  T_UNKNOWN,
  T_UNKNOWN_ADDITIONAL_PROPERTIES,
  T_ANY,
  T_ANY_ADDITIONAL_PROPERTIES,
} = require("./types/AST");
const {
  generateName,
  log,
  maybeStripDefault,
  maybeStripNameHints,
} = require("./utils");

module.exports.parse = (
  schema,
  options,
  keyName,
  processed = new Map(),
  usedNames = new Set()
) => {
  if (isPrimitive(schema)) return parseLiteral(schema, keyName);
  const types = typesOfSchema(schema);
  if (types.length === 1) {
    const ast = parseAsTypeWithCache(
      schema,
      types[0],
      options,
      keyName,
      processed,
      usedNames
    );
    log("blue", "parser", "Types:", types, "Input:", schema, "Output:", ast);
    return ast;
  }
  // Be careful to first process the intersection before processing its params,
  // so that it gets first pick for standalone name.
  const ast = parseAsTypeWithCache(
    {
      $id: schema.$id,
      allOf: [],
      description: schema.description,
      title: schema.title,
    },
    "ALL_OF",
    options,
    keyName,
    processed,
    usedNames
  );
  ast.params = types.map((type) =>
    // We hoist description (for comment) and id/title (for standaloneName)
    // to the parent intersection type, so we remove it from the children.
    parseAsTypeWithCache(
      maybeStripNameHints(schema),
      type,
      options,
      keyName,
      processed,
      usedNames
    )
  );
  log("blue", "parser", "Types:", types, "Input:", schema, "Output:", ast);
  return ast;
};

function parseAsTypeWithCache(
  schema,
  type,
  options,
  keyName,
  processed = new Map(),
  usedNames = new Set()
) {
  // If we've seen this node before, return it.
  let cachedTypeMap = processed.get(schema);
  if (!cachedTypeMap) {
    cachedTypeMap = new Map();
    processed.set(schema, cachedTypeMap);
  }
  const cachedAST = cachedTypeMap.get(type);
  if (cachedAST) {
    return cachedAST;
  }

  // Cache processed ASTs before they are actually computed, then update
  // them in place using set(). This is to avoid cycles.
  // TODO: Investigate alternative approaches (lazy-computing nodes, etc.)
  const ast = {};
  cachedTypeMap.set(type, ast);

  // Update the AST in place. This updates the `processed` cache, as well
  // as any nodes that directly reference the node.
  return Object.assign(
    ast,
    parseNonLiteral(schema, type, options, keyName, processed, usedNames)
  );
}

function parseLiteral(schema, keyName) {
  return {
    keyName,
    params: schema,
    type: "LITERAL",
  };
}

function parseNonLiteral(schema, type, options, keyName, processed, usedNames) {
  const definitions = getDefinitionsMemoized(getRootSchema(schema));
  const keyNameFromDefinition = findKey(definitions, (_) => _ === schema);

  switch (type) {
    case "ALL_OF":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        params: schema.allOf.map((_) =>
          module.exports.parse(_, options, undefined, processed, usedNames)
        ),
        type: "INTERSECTION",
      };
    case "ANY":
      return {
        ...(options.unknownAny ? T_UNKNOWN : T_ANY),
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
      };
    case "ANY_OF":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        params: schema.anyOf.map((_) =>
          module.exports.parse(_, options, undefined, processed, usedNames)
        ),
        type: "UNION",
      };
    case "BOOLEAN":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "BOOLEAN",
      };
    case "CUSTOM_TYPE":
      return {
        comment: schema.description,
        keyName,
        params: schema.tsType,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "CUSTOM_TYPE",
      };
    case "NAMED_ENUM":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition ?? keyName,
          usedNames
        ),
        params: schema.enum.map((_, n) => ({
          ast: module.exports.parse(
            _,
            options,
            undefined,
            processed,
            usedNames
          ),
          keyName: schema.tsEnumNames[n],
        })),
        type: "ENUM",
      };
    case "NAMED_SCHEMA":
      return newInterface(schema, options, processed, usedNames, keyName);
    case "NULL":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "NULL",
      };
    case "NUMBER":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "NUMBER",
      };
    case "OBJECT":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "OBJECT",
      };
    case "ONE_OF":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        params: schema.oneOf.map((_) =>
          module.exports.parse(_, options, undefined, processed, usedNames)
        ),
        type: "UNION",
      };
    case "REFERENCE":
      // throw Error(format('Refs should have been resolved by the resolver!', schema))
      return {
        comment: schema.description,
        keyName,
        params: options?.refToNameResolver(schema["$ref"]) ?? schema["$ref"],
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "CUSTOM_TYPE",
      };
    case "STRING":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "STRING",
      };
    case "TYPED_ARRAY":
      if (Array.isArray(schema.items)) {
        // normalised to not be undefined
        const minItems = schema.minItems;
        const maxItems = schema.maxItems;
        const arrayType = {
          comment: schema.description,
          keyName,
          maxItems,
          minItems,
          standaloneName: standaloneName(
            schema,
            keyNameFromDefinition,
            usedNames
          ),
          params: schema.items.map((_) =>
            module.exports.parse(_, options, undefined, processed, usedNames)
          ),
          type: "TUPLE",
        };
        if (schema.additionalItems === true) {
          arrayType.spreadParam = options.unknownAny ? T_UNKNOWN : T_ANY;
        } else if (schema.additionalItems) {
          arrayType.spreadParam = module.exports.parse(
            schema.additionalItems,
            options,
            undefined,
            processed,
            usedNames
          );
        }
        return arrayType;
      } else {
        return {
          comment: schema.description,
          keyName,
          standaloneName: standaloneName(
            schema,
            keyNameFromDefinition,
            usedNames
          ),
          params: module.exports.parse(
            schema.items,
            options,
            undefined,
            processed,
            usedNames
          ),
          type: "ARRAY",
        };
      }
    case "UNION":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        params: schema.type.map((type) => {
          const member = {
            ...omit(schema, "$id", "description", "title"),
            type,
          };
          return module.exports.parse(
            maybeStripDefault(member),
            options,
            undefined,
            processed,
            usedNames
          );
        }),
        type: "UNION",
      };
    case "UNNAMED_ENUM":
      return {
        comment: schema.description,
        keyName,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        params: schema.enum.map((_) =>
          module.exports.parse(_, options, undefined, processed, usedNames)
        ),
        type: "UNION",
      };
    case "UNNAMED_SCHEMA":
      return newInterface(
        schema,
        options,
        processed,
        usedNames,
        keyName,
        keyNameFromDefinition
      );
    case "UNTYPED_ARRAY":
      // normalised to not be undefined
      const minItems = schema.minItems;
      const maxItems =
        typeof schema.maxItems === "number" ? schema.maxItems : -1;
      const params = options.unknownAny ? T_UNKNOWN : T_ANY;
      if (minItems > 0 || maxItems >= 0) {
        return {
          comment: schema.description,
          keyName,
          maxItems: schema.maxItems,
          minItems,
          // create a tuple of length N
          params: Array(Math.max(maxItems, minItems) || 0).fill(params),
          // if there is no maximum, then add a spread item to collect the rest
          spreadParam: maxItems >= 0 ? undefined : params,
          standaloneName: standaloneName(
            schema,
            keyNameFromDefinition,
            usedNames
          ),
          type: "TUPLE",
        };
      }

      return {
        comment: schema.description,
        keyName,
        params,
        standaloneName: standaloneName(
          schema,
          keyNameFromDefinition,
          usedNames
        ),
        type: "ARRAY",
      };
  }
}

/**
 * Compute a schema name using a series of fallbacks
 */
function standaloneName(schema, keyNameFromDefinition, usedNames) {
  const name = schema.title || schema.$id || keyNameFromDefinition;
  if (name) {
    return generateName(name, usedNames);
  }

  return undefined;
}

function newInterface(
  schema,
  options,
  processed,
  usedNames,
  keyName,
  keyNameFromDefinition
) {
  const name = standaloneName(schema, keyNameFromDefinition, usedNames);
  return {
    comment: schema.description,
    keyName,
    params: parseSchema(schema, options, processed, usedNames, name),
    standaloneName: name,
    superTypes: parseSuperTypes(schema, options, processed, usedNames),
    type: "INTERFACE",
  };
}

function parseSuperTypes(schema, options, processed, usedNames) {
  // Type assertion needed because of dereferencing step
  // TODO: Type it upstream
  const superTypes = schema.extends;
  if (!superTypes) {
    return [];
  }
  return superTypes.map((_) =>
    module.exports.parse(_, options, undefined, processed, usedNames)
  );
}

/**
 * Helper to parse schema properties into params on the parent schema's type
 */
function parseSchema(schema, options, processed, usedNames, parentSchemaName) {
  let asts = map(schema.properties, (value, key) => ({
    ast: module.exports.parse(value, options, key, processed, usedNames),
    isPatternProperty: false,
    isRequired: includes(schema.required || [], key),
    isUnreachableDefinition: false,
    keyName: key,
  }));

  let singlePatternProperty = false;
  if (schema.patternProperties) {
    // partially support patternProperties. in the case that
    // additionalProperties is not set, and there is only a single
    // value definition, we can validate against that.
    singlePatternProperty =
      !schema.additionalProperties &&
      Object.keys(schema.patternProperties).length === 1;

    asts = asts.concat(
      map(schema.patternProperties, (value, key) => {
        const ast = module.exports.parse(
          value,
          options,
          key,
          processed,
          usedNames
        );
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema definition
via the \`patternProperty\` "${key}".`;
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment;
        return {
          ast,
          isPatternProperty: !singlePatternProperty,
          isRequired:
            singlePatternProperty || includes(schema.required || [], key),
          isUnreachableDefinition: false,
          keyName: singlePatternProperty ? "[k: string]" : key,
        };
      })
    );
  }

  if (options.unreachableDefinitions) {
    asts = asts.concat(
      map(schema.$defs, (value, key) => {
        const ast = module.exports.parse(
          value,
          options,
          key,
          processed,
          usedNames
        );
        const comment = `This interface was referenced by \`${parentSchemaName}\`'s JSON-Schema
via the \`definition\` "${key}".`;
        ast.comment = ast.comment ? `${ast.comment}\n\n${comment}` : comment;
        return {
          ast,
          isPatternProperty: false,
          isRequired: includes(schema.required || [], key),
          isUnreachableDefinition: true,
          keyName: key,
        };
      })
    );
  }

  // handle additionalProperties
  switch (schema.additionalProperties) {
    case undefined:
    case true:
      if (singlePatternProperty) {
        return asts;
      }
      return asts.concat({
        ast: options.unknownAny
          ? T_UNKNOWN_ADDITIONAL_PROPERTIES
          : T_ANY_ADDITIONAL_PROPERTIES,
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: "[k: string]",
      });

    case false:
      return asts;

    // pass "true" as the last param because in TS, properties
    // defined via index signatures are already optional
    default:
      return asts.concat({
        ast: module.exports.parse(
          schema.additionalProperties,
          options,
          "[k: string]",
          processed,
          usedNames
        ),
        isPatternProperty: false,
        isRequired: true,
        isUnreachableDefinition: false,
        keyName: "[k: string]",
      });
  }
}

function getDefinitions(schema, isSchema = true, processed = new Set()) {
  if (processed.has(schema)) {
    return {};
  }
  processed.add(schema);
  if (Array.isArray(schema)) {
    return schema.reduce(
      (prev, cur) => ({
        ...prev,
        ...getDefinitions(cur, false, processed),
      }),
      {}
    );
  }
  if (isPlainObject(schema)) {
    return {
      ...(isSchema && hasDefinitions(schema) ? schema.$defs : {}),
      ...Object.keys(schema).reduce(
        (prev, cur) => ({
          ...prev,
          ...getDefinitions(schema[cur], false, processed),
        }),
        {}
      ),
    };
  }
  return {};
}

const getDefinitionsMemoized = memoize(getDefinitions);

/**
 * TODO: Reduce rate of false positives
 */
function hasDefinitions(schema) {
  return "$defs" in schema;
}
