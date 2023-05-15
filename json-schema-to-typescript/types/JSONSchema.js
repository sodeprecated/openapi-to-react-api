const { isPlainObject, memoize } = require("lodash");

module.exports.Parent = Symbol("Parent");

module.exports.getRootSchema = memoize((schema) => {
  const parent = schema[module.exports.Parent];
  if (!parent) {
    return schema;
  }
  return module.exports.getRootSchema(parent);
});

module.exports.isPrimitive = (schema) => {
  return !isPlainObject(schema);
};

module.exports.isCompound = (schema) => {
  return Array.isArray(schema.type) || "anyOf" in schema || "oneOf" in schema;
};
