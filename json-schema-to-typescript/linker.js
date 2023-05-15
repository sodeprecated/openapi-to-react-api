const { isPlainObject } = require("lodash");
const { Parent } = require("./types/JSONSchema");

/**
 * Traverses over the schema, giving each node a reference to its
 * parent node. We need this for downstream operations.
 */
module.exports.link = (schema, parent = null) => {
  if (!Array.isArray(schema) && !isPlainObject(schema)) {
    return schema;
  }

  // Handle cycles
  if (schema.hasOwnProperty(Parent)) {
    return schema;
  }

  // Add a reference to this schema's parent
  Object.defineProperty(schema, Parent, {
    enumerable: false,
    value: parent,
    writable: false,
  });

  // Arrays
  if (Array.isArray(schema)) {
    schema.forEach((child) => module.exports.link(child, schema));
  }

  // Objects
  for (const key in schema) {
    module.exports.link(schema[key], schema);
  }

  return schema;
};
