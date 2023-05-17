const { deburr, isPlainObject, trim, upperFirst } = require("lodash");
const { basename, dirname, extname, normalize, sep, posix } = require("path");
const { Parent } = require("./types/JSONSchema");

// keys that shouldn't be traversed by the catchall step
const BLACKLISTED_KEYS = new Set([
  "id",
  "$defs",
  "$id",
  "$schema",
  "title",
  "description",
  "default",
  "multipleOf",
  "maximum",
  "exclusiveMaximum",
  "minimum",
  "exclusiveMinimum",
  "maxLength",
  "minLength",
  "pattern",
  "additionalItems",
  "items",
  "maxItems",
  "minItems",
  "uniqueItems",
  "maxProperties",
  "minProperties",
  "required",
  "additionalProperties",
  "definitions",
  "properties",
  "patternProperties",
  "dependencies",
  "enum",
  "type",
  "allOf",
  "anyOf",
  "oneOf",
  "not",
]);

function traverseObjectKeys(obj, callback, processed) {
  Object.keys(obj).forEach((k) => {
    if (obj[k] && typeof obj[k] === "object" && !Array.isArray(obj[k])) {
      module.exports.traverse(obj[k], callback, processed, k);
    }
  });
}

function traverseArray(arr, callback, processed) {
  arr.forEach((s, k) => module.exports.traverse(s, callback, processed, k.toString()));
}

module.exports.traverse = (schema, callback, processed = new Set(), key) => {
  if (!schema) {
    return;
  }
  // Handle recursive schemas
  if (processed.has(schema)) {
    return;
  }

  processed.add(schema);
  callback(schema, key ?? null);

  if (schema.anyOf) {
    traverseArray(schema.anyOf, callback, processed);
  }
  if (schema.allOf) {
    traverseArray(schema.allOf, callback, processed);
  }
  if (schema.oneOf) {
    traverseArray(schema.oneOf, callback, processed);
  }
  if (schema.properties) {
    traverseObjectKeys(schema.properties, callback, processed);
  }
  if (schema.patternProperties) {
    traverseObjectKeys(schema.patternProperties, callback, processed);
  }
  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === "object"
  ) {
    module.exports.traverse(schema.additionalProperties, callback, processed);
  }
  if (schema.items) {
    const { items } = schema;
    if (Array.isArray(items)) {
      traverseArray(items, callback, processed);
    } else {
      module.exports.traverse(items, callback, processed);
    }
  }
  if (schema.additionalItems && typeof schema.additionalItems === "object") {
    module.exports.traverse(schema.additionalItems, callback, processed);
  }
  if (schema.dependencies) {
    if (Array.isArray(schema.dependencies)) {
      traverseArray(schema.dependencies, callback, processed);
    } else {
      traverseObjectKeys(schema.dependencies, callback, processed);
    }
  }
  if (schema.definitions) {
    traverseObjectKeys(schema.definitions, callback, processed);
  }
  if (schema.$defs) {
    traverseObjectKeys(schema.$defs, callback, processed);
  }
  if (schema.not) {
    module.exports.traverse(schema.not, callback, processed);
  }

  // technically you can put definitions on any key
  Object.keys(schema)
    .filter((key) => !BLACKLISTED_KEYS.has(key))
    .forEach((key) => {
      const child = schema[key];
      if (child && typeof child === "object") {
        traverseObjectKeys(child, callback, processed);
      }
    });
};

/**
 * Eg. `foo/bar/baz.json` => `baz`
 */
module.exports.justName = (filename = "") => {
  return module.exports.stripExtension(basename(filename));
};

/**
 * Avoid appending "js" to top-level unnamed schemas
 */
module.exports.stripExtension = (filename) => {
  return filename.replace(extname(filename), "");
};

/**
 * Convert a string that might contain spaces or special characters to one that
 * can safely be used as a TypeScript interface or enum name.
 */
module.exports.toSafeString = (string) => {
  // identifiers in javaScript/ts:
  // First character: a-zA-Z | _ | $
  // Rest: a-zA-Z | _ | $ | 0-9

  return upperFirst(
    // remove accents, umlauts, ... by their basic latin letters
    deburr(string)
      // replace chars which are not valid for typescript identifiers with whitespace
      .replace(/(^\s*[^a-zA-Z_$])|([^a-zA-Z_$\d])/g, " ")
      // uppercase leading underscores followed by lowercase
      .replace(/^_[a-z]/g, (match) => match.toUpperCase())
      // remove non-leading underscores followed by lowercase (convert snake_case)
      .replace(/_[a-z]/g, (match) =>
        match.substr(1, match.length).toUpperCase()
      )
      // uppercase letters after digits, dollars
      .replace(/([\d$]+[a-zA-Z])/g, (match) => match.toUpperCase())
      // uppercase first letter after whitespace
      .replace(/\s+([a-zA-Z])/g, (match) => trim(match.toUpperCase()))
      // remove remaining whitespace
      .replace(/\s/g, "")
  );
};

module.exports.generateName = (from, usedNames) => {
  let name = module.exports.toSafeString(from);
  if (!name) {
    name = "NoName";
  }

  // increment counter until we find a free name
  if (usedNames.has(name)) {
    let counter = 1;
    let nameWithCounter = `${name}${counter}`;
    while (usedNames.has(nameWithCounter)) {
      nameWithCounter = `${name}${counter}`;
      counter++;
    }
    name = nameWithCounter;
  }

  usedNames.add(name);
  return name;
};

module.exports.error = (...messages) => {
  if (!process.env.VERBOSE) {
    return console.error(messages);
  }
  // console.error(getStyledTextForLogging('red')?.('error'), ...messages)
  console.error(...messages);
};

module.exports.log = (_style, _title, ...messages) => {
  if (!process.env.VERBOSE) {
    return;
  }
  let lastMessage = null;
  if (
    messages.length > 1 &&
    typeof messages[messages.length - 1] !== "string"
  ) {
    lastMessage = messages.splice(messages.length - 1, 1);
  }
  // console.info(require('cli-color').whiteBright.bgCyan('debug'), getStyledTextForLogging(style)?.(title), ...messages)
  if (lastMessage) {
    console.dir(lastMessage, { depth: 6, maxArrayLength: 6 });
  }
};

/**
 * escape block comments in schema descriptions so that they don't unexpectedly close JSDoc comments in generated typescript interfaces
 */
module.exports.escapeBlockComment = (schema) => {
  const replacer = "* /";
  if (schema === null || typeof schema !== "object") {
    return;
  }
  for (const key of Object.keys(schema)) {
    if (key === "description" && typeof schema[key] === "string") {
      schema[key] = schema[key]?.replace(/\*\//g, replacer);
    }
  }
};

/*
the following logic determines the out path by comparing the in path to the users specified out path.
For example, if input directory MultiSchema looks like:
  MultiSchema/foo/a.json
  MultiSchema/bar/fuzz/c.json
  MultiSchema/bar/d.json
And the user wants the outputs to be in MultiSchema/Out, then this code will be able to map the inner directories foo, bar, and fuzz into the intended Out directory like so:
  MultiSchema/Out/foo/a.json
  MultiSchema/Out/bar/fuzz/c.json
  MultiSchema/Out/bar/d.json
*/
module.exports.pathTransform = (outputPath, inputPath, filePath) => {
  const inPathList = normalize(inputPath).split(sep);
  const filePathList = dirname(normalize(filePath)).split(sep);
  const filePathRel = filePathList.filter((f, i) => f !== inPathList[i]);

  return posix.join(posix.normalize(outputPath), ...filePathRel);
};

/**
 * Removes the schema's `default` property if it doesn't match the schema's `type` property.
 * Useful when parsing unions.
 *
 * Mutates `schema`.
 */
module.exports.maybeStripDefault = (schema) => {
  if (!("default" in schema)) {
    return schema;
  }

  switch (schema.type) {
    case "array":
      if (Array.isArray(schema.default)) {
        return schema;
      }
      break;
    case "boolean":
      if (typeof schema.default === "boolean") {
        return schema;
      }
      break;
    case "integer":
    case "number":
      if (typeof schema.default === "number") {
        return schema;
      }
      break;
    case "string":
      if (typeof schema.default === "string") {
        return schema;
      }
      break;
    case "null":
      if (schema.default === null) {
        return schema;
      }
      break;
    case "object":
      if (isPlainObject(schema.default)) {
        return schema;
      }
      break;
  }
  delete schema.default;
  return schema;
};

/**
 * Removes the schema's `$id`, `name`, and `description` properties
 * if they exist.
 * Useful when parsing intersections.
 *
 * Mutates `schema`.
 */
module.exports.maybeStripNameHints = (schema) => {
  if ("$id" in schema) {
    delete schema.$id;
  }
  if ("description" in schema) {
    delete schema.description;
  }
  if ("name" in schema) {
    delete schema.name;
  }
  return schema;
};

module.exports.appendToDescription = (existingDescription, ...values) => {
  if (existingDescription) {
    return `${existingDescription}\n${values.join("\n")}`;
  }
  return values.join("\n");
};

module.exports.isSchemaLike = (schema) => {
  if (!isPlainObject(schema)) {
    return false;
  }
  const parent = schema[Parent];
  if (parent === null) {
    return true;
  }

  const JSON_SCHEMA_KEYWORDS = [
    "$defs",
    "allOf",
    "anyOf",
    "definitions",
    "dependencies",
    "enum",
    "not",
    "oneOf",
    "patternProperties",
    "properties",
    "required",
  ];
  if (JSON_SCHEMA_KEYWORDS.some((_) => parent[_] === schema)) {
    return false;
  }

  return true;
};
